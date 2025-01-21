global dir "C:\Users\Karls\OneDrive\Everything\Work in progress\DashDEV\CIH_dash\data\"
global data "C:\Users\\Karls\\OneDrive\Everything\Work in progress\CIH\data\"
cd "$dir"

// id which country have un wpp data
use if loctype=="Country/Area" & sex == 1 & x == 0 & year == 2019 using "$data\\wpp_life_table_singleyr" , clear
keep iso3
gen inun=1
save temp, replace

// id which country have WHO GHE data
use if year==2019 & sex==2 & inlist(age,0) & ghecause==0  using "$data\\GHE2021_update" , clear
keep iso3
gen inwho=1
merge 1:1 iso3 using temp, nogen
save temp, replace

// id which country have pre 1950 HMD data (and the earlist year)
use "$data\lt", clear
drop if ex==.
bys iso3 (year): keep if _n==1
keep if year<1950
tostring year, gen(minyear)
sum year
replace year=r(min) // this will be used for the frontier
keep iso3 year minyear
merge 1:1 iso3 using temp, nogen keep(using match)
save temp, replace

use iso3 region country aregion1 aregion2 aregion3 wbinc using "$data\\regions" , clear
merge 1:1 iso3 using temp, nogen keep(using match) // only keeps countries with data in the UN WPP or WHO GHE (this may be extended if adding more data)
save temp, replace

// create rows for each parent in the selection tree
foreach r in region aregion1 aregion2 aregion3 wbinc {
use temp , clear
duplicates drop `r', force
replace country = `r'
keep country
drop if country == ""

if "`r'" == "region" gen region = "CIH regions"
if "`r'" == "wbinc" gen region = "World Bank income groups"
if "`r'" == "aregion1" gen region = "UN regions"
if "`r'" == "aregion2" gen region = "UN sub-regions"
if "`r'" == "aregion3" gen region = "UN intermediate regions"
append using temp
save temp, replace
}

// Add rows for special regions (and World)
foreach var in `"Frontier (most favorable each year)"' `"European Union"' `"Islamic Development Bank Members"' `"Least Developed Countries"' `"Small Island Developing States"' `"World"' {
clear
set obs 1
gen country = "`var'"
gen region = "Other aggregates"
if "`var'"=="World"  replace region = "CIH regions"
append using temp
save temp, replace
} 


drop if strpos(region,"*")
replace country = subinstr(country,"*","",.)

// Just to order them
gen srt = 1 if strpos(region,"CIH")
replace srt = 2 if strpos(region, "World Bank")
replace srt = 2.1 if strpos(region, "World Bank") & strpos(country, "High")
replace srt = 3 if strpos(region, "UN regions")
replace srt = 4 if strpos(region, "sub-regions")
replace srt = 5 if strpos(region, "intermediate regions")
replace srt = 6 if strpos(region, "Other aggr")
replace srt = 7 if srt == . 



// Add a superscript and a note in the tree if there is not WHO data
gen supr = 1 if inwho!=1 & srt == 7

// Add a superscript and a note in the tree and earliest year for countries with HMD data 
// This specifically is for the frontier
sum year
replace minyear=string(r(min)) if strpos(country,"Frontier")


sort srt region country
keep region country minyear supr
replace country = " " + country if substr(region,1,2)=="UN"

export delimited using "countries.csv", replace
