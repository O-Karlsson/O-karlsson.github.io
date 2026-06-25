# Build main5data2.csv
#
# This is an R translation of CH2050_dash/data/dos/main5Data2.do.
# The intent is to reproduce the same dashboard dataset while making each
# Stata step explicit in R.  The script keeps a few odd-looking details from
# the Stata code, including the final tercile assignment rule, because changing
# them would change the output.

suppressPackageStartupMessages({
  library(dplyr)
  library(haven)
  library(readr)
  library(tidyr)
})

# ---------------------------------------------------------------------------
# Paths used by the original Stata program.
# ---------------------------------------------------------------------------

repo_dir <- normalizePath(file.path("C:", "OneDrive", "projects", "O-karlsson.github.io"),
                          winslash = "/", mustWork = TRUE)
output_dir <- file.path(repo_dir, "CH2050_dash", "data")
temp_dir <- file.path(output_dir, "tempfiles")
data_dir <- normalizePath(file.path("C:", "OneDrive", "data-warehouse", "data", "cleaned"),
                          winslash = "/", mustWork = TRUE)

path_clean <- function(...) file.path(data_dir, ...)
path_temp <- function(...) file.path(temp_dir, ...)
path_out <- function(...) file.path(output_dir, ...)

# ---------------------------------------------------------------------------
# Small helpers that mimic Stata behavior used below.
# ---------------------------------------------------------------------------

stata_sum <- function(x) {
  # Stata collapse (sum) ignores missing values and returns 0 when every value
  # is missing.  sum(..., na.rm = TRUE) has the same behavior in R.
  sum(x, na.rm = TRUE)
}

weighted_mean_stata <- function(x, w) {
  # Stata collapse (mean) with analytic weights ignores observations where the
  # measured value is missing.  It also requires a usable weight.
  keep <- !is.na(x) & !is.na(w)
  if (!any(keep)) {
    return(NA_real_)
  }
  sum(x[keep] * w[keep]) / sum(w[keep])
}

stata_pctile <- function(x, probs) {
  # Stata's default _pctile rule:
  #   i = N * p / 100
  #   if i is an integer, average ordered values i and i + 1
  #   otherwise use ordered value ceil(i)
  #
  # This matches R quantile(type = 2), but the explicit version makes the Stata
  # dependency clear and avoids surprises if quantile defaults change.
  x <- sort(x[!is.na(x)])
  n <- length(x)
  if (n == 0) {
    return(rep(NA_real_, length(probs)))
  }

  vapply(probs, function(p) {
    i <- n * p / 100
    if (i <= 0) {
      return(x[1])
    }
    if (i >= n) {
      return(x[n])
    }
    if (abs(i - round(i)) < .Machine$double.eps^0.5) {
      return((x[i] + x[i + 1]) / 2)
    }
    x[ceiling(i)]
  }, numeric(1))
}

stata_cut_age <- function(age) {
  # Stata: egen ageg = cut(age), at(-1,0,1,5,20)
  # Intervals are [-1,0), [0,1), [1,5), and [5,20), labelled by the lower
  # bound.  The script later recodes -1 to 99 for the neonatal-death row.
  case_when(
    age >= -1 & age < 0 ~ -1,
    age >= 0 & age < 1 ~ 0,
    age >= 1 & age < 5 ~ 1,
    age >= 5 & age < 20 ~ 5,
    TRUE ~ NA_real_
  )
}

stata_log_change <- function(value, year) {
  # For each lid/sex/ageg group, Stata sorts by year and compares the first and
  # last observations.  The value is only defined when exactly two usable years
  # are present and the years differ.
  ord <- order(year)
  value <- value[ord]
  year <- year[ord]

  if (length(value) == 2 && year[2] > year[1] && value[1] > 0 && value[2] > 0) {
    (log(value[2]) - log(value[1])) / (year[2] - year[1])
  } else {
    NA_real_
  }
}

project_2050 <- function(value, year) {
  ord <- order(year)
  value <- value[ord]
  year <- year[ord]
  n <- length(value)

  if (n >= 2 && year[n] != year[1] && value[1] > 0 && value[n] > 0) {
    exp(log(value[n]) + ((log(value[n]) - log(value[1])) / (year[n] - year[1])) *
          (2050 - year[n]))
  } else {
    NA_real_
  }
}

latest_pct_decrease <- function(value, projected2050) {
  n <- length(value)
  if (n >= 1 && value[n] > 0 && !is.na(projected2050[n])) {
    100 * (value[n] - projected2050[n]) / value[n]
  } else {
    NA_real_
  }
}

# ---------------------------------------------------------------------------
# Preparing life tables.
# ---------------------------------------------------------------------------

# The neonatal mortality input comes from GBD.  These rows are assigned age -1
# so they can later be collapsed into a separate age group and used to split
# infant mortality into neonatal and post-neonatal components.
location_keys <- read_dta(path_clean("keys", "location_keys", "data.dta")) %>%
  select(location_label, subregion, region, incomegr, location_id, iso3,
         NCD_RisC_country)

# Only the GBD neonatal-death merge has Stata's "if location_id != ." filter.
# Later merges reload the full key table, so keep a filtered copy only for GBD.
location_keys_gbd <- location_keys %>%
  filter(!is.na(location_id))

gbd_neonatal <- read_dta(path_clean(
  "GBD",
  "Number of deaths all causes before age 28 days and before age 1 year for all countries",
  "data.dta"
)) %>%
  select(location_id, sex, year, dth1, dthn)

temp <- location_keys_gbd %>%
  select(location_label, subregion, region, incomegr, location_id, iso3) %>%
  inner_join(gbd_neonatal, by = "location_id") %>%
  select(-location_id) %>%
  mutate(age = -1) %>%
  filter(year %in% c(2013, 2023))

# UN WPP life tables provide age-specific mortality probabilities and the
# exposure needed to aggregate mx, ax, and qx across regions.
life_tables <- read_dta(path_clean("unwpp", "life tables", "estimates", "data.dta")) %>%
  select(LocID, iso3, mx, year, age, sex, qx, ax) %>%
  filter(iso3 != "", age < 20, year %in% c(2013, 2023))

population_deaths <- read_dta(path_clean("unwpp", "population and deaths", "estimates", "data.dta")) %>%
  select(LocID, iso3, year, sex, age, exposure, pop)

life_country <- life_tables %>%
  left_join(population_deaths %>% select(LocID, year, sex, age, exposure, pop),
            by = c("LocID", "year", "sex", "age")) %>%
  inner_join(location_keys %>%
               select(location_label, subregion, region, incomegr, location_id, iso3),
             by = "iso3") %>%
  filter(iso3 != "", age < 20, year %in% c(2013, 2023))

temp <- bind_rows(life_country, temp) %>%
  mutate(
    heading1 = "Countries",
    heading2 = region,
    loc = location_label,
    global = "Global"
  )

# Aggregate the country rows to UN regions, UN subregions, World Bank income
# groups, and a global total.  This follows the Stata loop over region,
# subregion, incomegr, and global.
#
# Important Stata detail: the loop uses preserve/restore.  Each aggregation is
# therefore computed from the original country-level data, while the saved temp
# file accumulates the aggregate rows.  Do not aggregate previously-created
# aggregate rows.
life_aggregate_source <- temp
for (r in c("region", "subregion", "incomegr", "global")) {
  aggregated <- life_aggregate_source %>%
    mutate(
      deaths = mx * exposure,
      ax = ax * deaths
    ) %>%
    group_by(.data[[r]], sex, year, age) %>%
    summarise(
      deaths = stata_sum(deaths),
      exposure = stata_sum(exposure),
      ax = stata_sum(ax),
      dth1 = stata_sum(dth1),
      dthn = stata_sum(dthn),
      .groups = "drop"
    ) %>%
    mutate(
      loc = .data[[r]],
      heading1 = "Aggregates",
      heading2 = r,
      mx = deaths / exposure,
      ax = ax / deaths,
      qx = mx / (1 + (1 - ax) * mx)
    )

  temp <- bind_rows(temp, aggregated)
}

# Collapse the WPP age-specific qx values to 0, 1-4, and 5-19; recode the GBD
# age -1 row to 99; then reshape wide so the mortality formulas can refer to
# qx0, qx1, qx5, dthn99, and dth199 as in Stata.
mortality_wide <- temp %>%
  mutate(
    ageg = stata_cut_age(age),
    qx = log(1 - qx)
  ) %>%
  group_by(heading1, heading2, loc, sex, year, ageg, iso3) %>%
  summarise(
    qx = stata_sum(qx),
    dth1 = stata_sum(dth1),
    dthn = stata_sum(dthn),
    .groups = "drop"
  ) %>%
  mutate(
    qx = 1 - exp(qx),
    ageg = if_else(ageg == -1, 99, ageg)
  ) %>%
  pivot_wider(
    id_cols = c(heading1, heading2, loc, sex, year, iso3),
    names_from = ageg,
    values_from = c(qx, dth1, dthn),
    names_glue = "{.value}{ageg}"
  )

temp <- mortality_wide %>%
  mutate(
    ennm = qx0 * dthn99 / dth199,
    epnm = 1 - exp(log(1 - qx0) + log(1 - qx1) - log(1 - ennm)),
    eu20m = 1 - exp(log(1 - qx0) + log(1 - qx1) + log(1 - qx5)),
    eq5_19 = qx5
  ) %>%
  select(heading1, heading2, loc, sex, year, iso3, ennm, epnm, eu20m, eq5_19) %>%
  pivot_longer(
    cols = starts_with("e"),
    names_to = "ageg",
    values_to = "e",
    names_prefix = "e"
  ) %>%
  mutate(e = e * 1000)

# ---------------------------------------------------------------------------
# Preparing height data.
# ---------------------------------------------------------------------------

height_population <- read_dta(path_clean("unwpp", "population and deaths", "estimates", "data.dta")) %>%
  select(iso3, year, sex, age, pop) %>%
  filter(age == 19, year %in% c(2009, 2019), iso3 != "")

height_data <- read_dta(path_clean("NCDRisc", "height", "data.dta")) %>%
  select(country, sex, year, age_group, mean_height)

temp2 <- height_population %>%
  left_join(location_keys %>%
              select(NCD_RisC_country, iso3, region, subregion, incomegr, location_label),
            by = "iso3") %>%
  mutate(
    country = NCD_RisC_country,
    age_group = age
  ) %>%
  left_join(height_data, by = c("country", "sex", "year", "age_group")) %>%
  filter(age == 19, year %in% c(2009, 2019)) %>%
  select(iso3, year, age, sex, pop, mean_height, region, subregion, incomegr,
         location_label)

# Stata reshapes sex wide, computes both-sex height as the population-weighted
# average of sex 1 and sex 2, then reshapes long again.
height_long <- temp2 %>%
  pivot_wider(
    id_cols = c(iso3, year, age, region, subregion, incomegr, location_label),
    names_from = sex,
    values_from = c(mean_height, pop),
    names_glue = "{.value}{sex}"
  ) %>%
  mutate(
    mean_height3 = (mean_height1 * pop1 + mean_height2 * pop2) / (pop1 + pop2),
    pop3 = pop1 + pop2
  ) %>%
  pivot_longer(
    cols = matches("^(mean_height|pop)[123]$"),
    names_to = c(".value", "sex"),
    names_pattern = "^(mean_height|pop)([123])$"
  ) %>%
  mutate(sex = as.numeric(sex)) %>%
  filter(!is.na(mean_height)) %>%
  mutate(
    loc = location_label,
    heading1 = "Countries",
    heading2 = region,
    global = "Global"
  )

temp2 <- height_long

# Aggregate height using population analytic weights, matching Stata collapse
# (mean) mean_height [aweight=pop].
#
# As above, Stata preserve/restore means each loop iteration aggregates the
# original country-level height rows, not rows produced by earlier iterations.
height_aggregate_source <- temp2
for (r in c("region", "subregion", "incomegr", "global")) {
  aggregated_height <- height_aggregate_source %>%
    group_by(.data[[r]], sex, year, age) %>%
    summarise(
      mean_height = weighted_mean_stata(mean_height, pop),
      .groups = "drop"
    ) %>%
    mutate(
      loc = .data[[r]],
      heading1 = "Aggregates",
      heading2 = r
    )

  temp2 <- bind_rows(temp2, aggregated_height)
}

# Convert height to a "gap from tallest observed in the same sex" measure.
height_gap <- temp2 %>%
  group_by(sex) %>%
  arrange(mean_height, .by_group = TRUE) %>%
  mutate(e = mean_height[n()] - mean_height) %>%
  ungroup() %>%
  mutate(ageg = "hgap") %>%
  select(heading1, heading2, loc, sex, year, ageg, e, iso3)

temp2 <- bind_rows(height_gap, temp)

# ---------------------------------------------------------------------------
# Preparing math data.
# ---------------------------------------------------------------------------

math_data <- read_dta(path_clean("OWID", "academic-performance", "data.dta")) %>%
  select(code, year, score_math_both, score_math_boys, score_math_girls)

temp <- read_dta(path_clean("keys", "location_keys", "data.dta")) %>%
  select(location_label, iso3, region) %>%
  rename(code = iso3) %>%
  mutate(code = if_else(code == "XKX", "OWID_KOS", code)) %>%
  inner_join(math_data, by = "code") %>%
  mutate(
    loc = location_label,
    code = if_else(code == "OWID_KOS", "XKX", code)
  ) %>%
  rename(iso3 = code, e3 = score_math_both, e1 = score_math_boys,
         e2 = score_math_girls) %>%
  select(year, e3, e1, e2, loc, region, iso3) %>%
  pivot_longer(cols = c(e3, e1, e2), names_to = "sex", values_to = "e",
               names_prefix = "e") %>%
  mutate(sex = as.numeric(sex)) %>%
  filter(!is.na(e))

# For each country/sex, keep the most recent math observation and the
# observation closest to ten years before that most recent year.
temp <- temp %>%
  group_by(loc, sex) %>%
  mutate(
    maxyear = max(year, na.rm = TRUE),
    distance_from_maxyear = abs(maxyear - year - 10)
  ) %>%
  arrange(distance_from_maxyear, .by_group = TRUE) %>%
  filter(row_number() == 1 | year == maxyear) %>%
  ungroup() %>%
  select(-distance_from_maxyear, -maxyear) %>%
  mutate(
    heading1 = "Countries",
    heading2 = region,
    ageg = "math"
  ) %>%
  select(-region)

# Stata runs "sum e" after the keep above, then replaces e with r(max) - e.
math_max <- max(temp$e, na.rm = TRUE)
temp <- temp %>%
  mutate(e = math_max - e)

# ---------------------------------------------------------------------------
# Constructing population weights for tercile cut points.
# ---------------------------------------------------------------------------

pop <- read_dta(path_clean("unwpp", "population and deaths", "estimates", "data.dta")) %>%
  select(iso3, year, age, sex, pop) %>%
  filter(iso3 != "", year == 2023, sex == 3) %>%
  group_by(iso3) %>%
  summarise(pop = stata_sum(pop), .groups = "drop")

write_dta(pop, path_temp("pop.dta"))

# ---------------------------------------------------------------------------
# Finalize the data.
# ---------------------------------------------------------------------------

locids <- read_dta(path_temp("locids.dta")) %>%
  select(heading1, heading2, loc, lid)

final_data <- bind_rows(temp, temp2) %>%
  mutate(
    heading2 = case_when(
      heading2 == "incomegr" ~ "World Bank Income groups",
      heading2 == "subregion" ~ "UN subregions",
      heading2 == "region" ~ "UN regions",
      TRUE ~ heading2
    ),
    heading1 = if_else(grepl("Countries", heading1), "Countries and territories",
                       heading1)
  ) %>%
  inner_join(locids, by = c("heading1", "heading2", "loc")) %>%
  rename(value = e) %>%
  filter(!is.na(value)) %>%
  mutate(value = if_else(value == 0, 0.000000000001, value)) %>%
  group_by(lid, sex, ageg) %>%
  arrange(year, .by_group = TRUE) %>%
  mutate(
    aapc = stata_log_change(value, year),
    projected2050 = project_2050(value, year),
    x = (value[n()] / 2) / projected2050,
    pct_decrease2050 = latest_pct_decrease(value, projected2050)
  ) %>%
  filter(row_number() == n()) %>%
  ungroup() %>%
  mutate(value = if_else(value == 0, 0.1, value)) %>%
  left_join(pop, by = "iso3") %>%
  mutate(tercile = NA_integer_)

# Keep the Stata tercile quirk exactly:
#   * Cut points are calculated from aapc among country rows with pop > 5000.
#   * Rows are assigned to terciles by comparing *value* to those aapc cut
#     points, not by comparing aapc to the cut points.
for (this_ageg in sort(unique(final_data$ageg))) {
  for (this_sex in 1:3) {
    cut_source <- final_data %>%
      filter(ageg == this_ageg, pop > 5000, !is.na(pop), sex == this_sex) %>%
      pull(aapc)
    cuts <- stata_pctile(cut_source, c(100 / 3, 200 / 3))

    if (all(is.na(cuts))) {
      next
    }

    row_index <- final_data$ageg == this_ageg & final_data$sex == this_sex
    final_data$tercile[row_index & final_data$value <= cuts[1]] <- 1L
    final_data$tercile[row_index & final_data$value > cuts[1] &
                         final_data$value <= cuts[2]] <- 2L
    final_data$tercile[row_index & final_data$value > cuts[2]] <- 3L
  }
}

final_data <- final_data %>%
  select(year, sex, value, ageg, lid, aapc, projected2050, pct_decrease2050,
         pop, tercile)

write_csv(final_data, path_out("main5data2.csv"), na = "")

# The Stata script also saves a list of location ids represented in this
# dataset.  Recreate it for downstream code that may expect tempfiles/haspisa.dta.
haspisa <- final_data %>%
  distinct(lid)

write_dta(haspisa, path_temp("haspisa.dta"))
