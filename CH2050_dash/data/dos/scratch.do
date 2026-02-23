global output_dir "C:\Users\Karls\OneDrive\Work in progress\2025-01-15 GitRepos\O-karlsson.github.io\CH2050_dash\data"
global dir "C:\Users\Karls\OneDrive\Work in progress\2025-01-15 GitRepos\O-karlsson.github.io\CH2050_dash\data\tempfiles"
global data "C:\Users\Karls\OneDrive\Everything\data\data-warehouse\data\cleaned"
cd "$dir"

********************************************************************************************************************************************
********************************************************************************************************************************************
*** Preparing life tables
********************************************************************************************************************************************
********************************************************************************************************************************************

********************************************************************************************************************************************
*** UN life tables
use LocID iso3 mx year age sex qx ax if iso3!="" & age<20 using "$data/unwpp/life tables/estimates/data.dta" , clear
merge 1:1 LocID year sex age using "$data/unwpp/population and deaths/estimates/data.dta" , nogen keep(master match) keepusing(exposure) // need the 'expsoure' variable to aggregate
merge m:1 iso3 using "$data/keys/location_keys/data.dta" , keepusing(location_label subregion region incomegr) nogen keep(match) // matches iso3 to regions/subregions/income groups
gen heading1 = "Countries" // heading1 is the static heading on the dashboard
gen heading2 = region // heading two is the collapseble heading on the dashboard
gen loc = location_label // the locations
save temp, replace

* Aggregating by region/income groups
foreach r in region subregion incomegr {
preserve
gen deaths2 = mx*exposure
gen ax2 = ax*deaths2
collapse (sum) deaths2 exposure ax2 , by(`r' sex year age)
gen loc = `r'
gen heading1 = "Aggregates"
gen heading2 = "`r'"
gen mx = deaths2/exposure
gen ax = ax2/deaths2
gen qx = mx/(1+(1-ax)*mx)
append using temp
save temp, replace
restore
}



********************************************************************************************************************************************
*** Adding HMD data
foreach c in USA Canada Japan France {
use name year age sex qx if age < 20 using "$data/HMD/life tables/`c'/data.dta" , clear
gen heading2 = "`c'"
gen heading1 = "Subnational regions"
gen loc = name
replace loc = "Total " + name if inlist(name,"Japan", "Canada", "France", "United States") // Total France is not in there, add later
keep year age sex qx loc heading1 heading2 
append using temp
save temp, replace
}

********************************************************************************************************************************************
*** Calculating relevent mortality rates

use temp, replace
egen ageg = cut(age),at(0,1,5,10,15,20)
replace qx = ln(1-qx)
collapse (sum) qx , by(heading1 heading2 subregion loc sex year ageg)
replace qx = (1-exp(qx))*1000
reshape wide qx , i(heading1 heading2 loc sex year) j(ageg)
gen u5m = (1-exp(ln(1-qx0/1000)+ln(1-qx1/1000)))*1000
rename (qx0 qx1 qx5 qx10 qx15)(imr cmr q5_10 q10_15 q15_19)
save temp, replace


********************************************************************************************************************************************
********************************************************************************************************************************************
*** Preparing height data
********************************************************************************************************************************************
********************************************************************************************************************************************

use iso3 year sex age pop if inlist(age,5,10,15,19) & inrange(year,1985,2023) & iso3!="" & sex!=3 using "$data/unwpp/population and deaths/estimates/data.dta" , clear
merge m:1 iso using "$data/keys/location_keys/data.dta" , keepusing(location_label iso3 region subregion incomegr) nogen
gen country = location_label
replace country = "China (Hong Kong SAR)"   if country == "Hong Kong"
replace country = "Cote d'Ivoire"   if country == "Côte d'Ivoire"
replace country = "Czech Republic"   if country == "Czechia"
replace country = "DR Congo"   if country == "Congo DR"
replace country = "Guinea Bissau"   if country == "Guinea-Bissau"
replace country = "Lao PDR"   if country == "Lao"
replace country = "Macedonia (TFYR)"   if country == "North Macedonia"
replace country = "Micronesia (Federated States of)"   if country == "Micronesia"
replace country = "Occupied Palestinian Territory"   if country == "Palestine"
replace country = "Russian Federation"   if country == "Russia"
replace country = "Swaziland"   if country == "Eswatini"
replace country = "Syrian Arab Republic"   if country == "Syria"
replace country = "Turkey"   if country == "Türkiye"
replace country = "United States of America"   if country == "United States"
gen age_group = age
merge 1:1 country sex year age_group using "$data\NCDRisc\height\data.dta" , keep(match) nogen keepusing(mean_height)

reshape wide mean_height pop , i(iso3 year age) j(sex)
gen mean_height3= (mean_height1*pop1+mean_height2*pop2)/(pop1+pop2)
gen pop3 = pop1+pop2
reshape long mean_height pop , i(iso3 year age) j(sex)

gen loc = location_label

// The same structure as above
gen heading1 = "Countries"
gen heading2 = region
save temp3, replace

// Aggregating nmr like above
foreach r in region subregion incomegr {
preserve
collapse (mean) mean_height [aweight=pop] , by(`r' age sex year)
gen loc = `r'
sum
gen heading1 = "Aggregates"
gen heading2 = "`r'"
append using temp3
save temp3, replace
restore
}

use temp3, clear
keep heading1 heading2 loc year age sex mean_height
rename mean_height ncdcm
reshape wide ncdcm , i(loc heading1 heading2 year sex) j(age)
merge 1:1 heading1 heading2 loc sex year using temp, nogen
save temp, replace


********************************************************************************************************************************************
********************************************************************************************************************************************
*** Preparing neonatal mortality data
********************************************************************************************************************************************
********************************************************************************************************************************************

// The neonatal mortality from GBD
use location_id iso3 if location_id!=. using "$data/keys/location_keys/data.dta" , clear // location_id is a IHME specific location identifier, IHME doesn't include iso3
merge 1:m location_id using "$data/GBD/Propability of death all cause before age 28 days for all countries/data.dta", nogen keep(match) keepusing(location_id sex year qx)
merge 1:1 location_id year sex using "$data/GBD/Number of deaths all causes before age 28 days and before age 1 year for all countries\data", keep(match) nogen keepusing(location_id sex year dth1 dthn)
drop location_id
save temp2, replace

// Getting number of births from UN WPP
use iso3 year Births SRB if year < 2024 & iso3!="" using "$data/unwpp/demovars/data.dta", clear
gen pmale = SRB/(SRB+100) // SRB = sex ratio at birth. pmale is proportion male
gen Births1 = Births*pmale
gen Births2 = Births-Births
rename Births Births3
drop SRB pmale
reshape long Births, i(iso3 year) j(sex)
replace iso3 = "RKS"  if iso3 == "XKX" // Kosovo ISO3 can be inconsistent
merge 1:1 iso3 year sex using temp2, nogen // add the IHME GBD data prepared earlier
save temp2 , replace

// UN IGME neonatal mortality rates
use iso3 year nmr using "$data/unicef/neonatal mortality rates/data.dta", replace
gen sex = 3 // These are only available for both males and females combined
rename nmr unnmr
merge 1:1 iso3 year sex using temp2, nogen // combing the data prepared above
replace iso3 = "XKX"   if iso3 == "RKS" // Kosovo again
merge m:1 iso3 using "$data/keys/location_keys/data.dta", keepusing(iso3 location_label subregion region incomegr)

// The same structure as above
gen heading1 = "Countries"
gen heading2 = region
gen loc = location_label
drop if qx == . & unnmr == . & dth1==. & dthn==.
save temp2, replace

// Aggregating nmr like above
foreach r in region subregion incomegr {
preserve
replace unnmr = . if year <1989 // So regions alway include the same countries. The data is spotty before 1989.
collapse (mean) qx unnmr (rawsum) dth1 dthn [aweight=Births] , by(`r' sex year)
gen loc = `r'
sum
gen heading1 = "Aggregates"
gen heading2 = "`r'"
append using temp2
save temp2, replace
restore
}
use temp2, clear
gen gbdnmr=qx*1000
keep year sex gbdnmr loc heading1 heading2 dth1 dthn unnmr subregion

// mergin the other mortality rates, from the life tables
merge 1:1  heading1 heading2 loc year sex using temp, nogen

* dthsn/dths1 calculates the propotion of deaths before age one that happened by age 28 days.
* Then use the proportion to calculate the neonatal mortality rate based un IMR from UN WPP.
* Otherwise neonatal mortality rate from GBD can be greater than IMR from UN WPP.
gen nmr = dthn/dth1*imr 
gen pnm = imr-nmr // Also, if using the GBD NMR then PNMR could end up being negative

keep year sex unnmr loc heading1 heading2 subregion gbdnmr imr cmr q5_10 q10_15 q15_19 u5m nmr pnm ncdcm5 ncdcm10 ncdcm15 ncdcm19
save temp , replace

foreach var in unnmr gbdnmr imr cmr q5_10 q10_15 q15_19 u5m nmr pnm ncdcm5 ncdcm10 ncdcm15 ncdcm19  {
rename `var' e`var'
}
reshape long e , i(heading1 heading2 loc year sex) j(var) string
drop if var =="unnmr" & year<1989
keep if inlist(heading1,"Countries","Subnational regions")
replace subregion = heading2 if heading1=="Subnational regions"
drop if strpos(loc,"Total ") & heading1=="Subnational regions" 
drop if e==.
save temp2, replace


bys heading1 subregion sex year var: gen count = string(_N)
bys heading1 subregion sex year var (e): keep if inlist(_n,1,_N)
gen note_ = loc 
replace note_ = loc + ". Includes " + count + " regions." if heading1=="Subnational regions"
bys heading1 subregion sex year var (e): replace loc = subregion + ", lowest each year" if _n==1
bys heading1 subregion sex year var (e): replace loc = subregion + ", highest each year" if _n==_N
replace heading2 = "UN subregions" if heading1 == "Countries"
replace heading2 = "Subnational regions" if heading1 == "Subnational regions"
replace heading1 = "Lowest or highest mortality"
drop subregion count
reshape wide e note_ , i(heading1 heading2 loc year sex) j(var) string
foreach var in unnmr gbdnmr imr cmr q5_10 q10_15 q15_19 u5m nmr pnm  ncdcm5 ncdcm10 ncdcm15 ncdcm19 {
rename e`var' `var'
}
append using temp
save temp , replace

use temp2, clear
keep if inlist(heading1,"Countries")
bys sex year var (e): keep if inlist(_n,1,_N)
gen note_ = loc
bys sex year var (e): replace loc = "All countries, lowest each year" if _n==1
bys sex year var (e): replace loc = "All countries, highest each year" if _n==_N
replace heading2 = "Global"
replace heading1 = "Lowest or highest mortality"
drop subregion
reshape wide e note_ , i(heading1 heading2 loc year sex) j(var) string
foreach var in unnmr gbdnmr imr cmr q5_10 q10_15 q15_19 u5m nmr pnm  ncdcm5 ncdcm10 ncdcm15 ncdcm19 {
rename e`var' `var'
}
append using temp
save temp , replace

use temp2, clear
keep if inlist(heading1,"Subnational regions")
keep if inrange(year,1989,2021)
bys sex year var: gen count = string(_N)
bys sex year var (e): keep if inlist(_n,1,_N)
gen note_ = heading2 + ": " + loc + ". Includes " + count + " regions."
bys sex year var (e): replace loc = "All subnational regions, lowest each year" if _n==1
bys sex year var (e): replace loc = "All subnational regions, highest each year" if _n==_N
replace heading2 = "Subnational regions"
replace heading1 = "Lowest or highest mortality"
drop subregion
reshape wide e note_ , i(heading1 heading2 loc year sex) j(var) string
foreach var in   imr cmr q5_10 q10_15 q15_19 u5m  {
rename e`var' `var'
}
append using temp
save temp , replace

keep if loc == "France" & heading1=="Countries"
replace heading2 = "France"
replace heading1 = "Subnational regions"
replace loc = "Total " + loc
append using temp
save temp, replace


use location_label dhs_countrycode region if dhs_countrycode!="" using "$data/keys/location_keys/data.dta" , clear
merge 1:m dhs_countrycode using dhscm, nogen keep(match)
rename location_label loc
gen sex = 2
gen heading1 = "Countries"
gen heading2 = region
merge 1:1 heading1 heading2 loc year sex using temp , nogen
save temp, replace





keep year sex loc heading1 heading2 imr cmr q5_10 q10_15 q15_19 u5m nmr pnm unnmr cms gbdnmr note_* ncdcm5 ncdcm10 ncdcm15 ncdcm19

replace heading2 = "World Bank Income groups" if heading2 == "incomegr"
replace heading2 = "UN regions" if heading2 == "region"
replace heading2 = "UN subregions" if heading2 == "subregion"
replace loc = "Northern America " if loc == "Northern America" & heading2=="UN subregions"

compress
sort sex heading1 heading2 loc  year
save yeardata, replace
export delimited using "$output_dir\yearlydata" , replace

use yeardata , clear
foreach var in imr cmr q5_10 q10_15 q15_19 u5m nmr pnm unnmr cms gbdnmr ncdcm5 ncdcm10 ncdcm15 ncdcm19 {
bys heading1 heading2 loc: egen has_`var' = max(`var'!=.)
}

duplicates drop heading1 heading2 loc, force
keep heading1 heading2 loc has_*
compress
export delimited using "$output_dir\location_select" , replace
x

twoway (line q15_19 year if sex == 1 & loc == "Northern America"  & heading2=="UN regions")(line q10_15 year if sex == 1 & loc == "Northern America" & heading2=="UN subregions")

twoway (line q15_19 year if sex == 1 & loc == "Japan", sort)(line q15_19 year if sex == 1 & loc == "United States", sort)

foreach var in has_imr has_cmr has_q5_10 has_q10_15 has_q15_19 has_u5m has_nmr has_pnm has_unnmr has_cms has_gbdnmr {
dis "`var' should say" `" "","'
}

duplicates drop heading1 heading2 loc, force
keep heading1 heading2 loc has_*
