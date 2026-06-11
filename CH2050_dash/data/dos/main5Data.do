global output_dir "C:\OneDrive\projects\O-karlsson.github.io\CH2050_dash\data"
global dir "C:\OneDrive\projects\O-karlsson.github.io\CH2050_dash\data\tempfiles"
global data "C:\OneDrive\data-warehouse\data\cleaned"
cd "$dir"

********************************************************************************************************************************************
********************************************************************************************************************************************
*** Preparing life tables
********************************************************************************************************************************************
********************************************************************************************************************************************

// The neonatal mortality from GBD
use location_label subregion region incomegr  location_id iso3 if location_id!=.  using "$data/keys/location_keys/data.dta" , clear // location_id is a IHME specific location identifier, IHME doesn't include iso3
merge 1:m location_id using "$data/GBD/Number of deaths all causes before age 28 days and before age 1 year for all countries\data", keep(match) nogen keepusing(sex year dth1 dthn)
drop location_id
gen age = - 1 
keep if inlist(year,2013,2023)
save temp, replace

// UN WPP life tables
use LocID iso3 mx year age sex qx ax if iso3!="" & age<20  & inlist(year,2013,2023)  using "$data/unwpp/life tables/estimates/data.dta" , clear
merge 1:1 LocID year sex age using "$data/unwpp/population and deaths/estimates/data.dta" , nogen keep(master match) keepusing(exposure pop) // need the 'expsoure' variable to aggregate
merge m:1 iso3 using "$data/keys/location_keys/data.dta" , keepusing(location_label subregion region incomegr  location_id iso3) nogen keep(match) // matches iso3 to regions/subregions/income groups
keep if iso3!="" & age<20 & inlist(year,2013,2023)

append using temp

gen heading1 = "Countries" // heading1 is the static heading on the dashboard
gen heading2 = region // heading two is the collapseble heading on the dashboard
gen loc = location_label // the locations
save temp, replace

// Aggregating by region/income groups
foreach r in  region subregion incomegr   {
preserve
gen deaths = mx*exposure
replace ax = ax*deaths
collapse (sum) deaths exposure ax dth1 dthn , by(`r' sex year age)
gen loc = `r'
gen heading1 = "Aggregates"
gen heading2 = "`r'"
gen mx = deaths/exposure
replace ax = ax/deaths
gen qx = mx/(1+(1-ax)*mx)
append using temp
save temp, replace
restore
}

use temp, replace
egen ageg = cut(age),at(-1,0,1,5,20)
replace qx = ln(1-qx)
collapse (sum) qx dth1 dthn , by(heading1 heading2 loc sex year ageg iso3)
replace qx = 1-exp(qx)
replace ageg = 99 if ageg==-1
reshape wide qx dth1 dthn , i(heading1 heading2 loc sex year) j(ageg)

gen ennm = qx0*dthn99/dth199
gen epnm = (1-exp(ln(1-qx0)+ln(1-qx1)-ln(1-ennm)))
gen eu20m = (1-exp(ln(1-qx0)+ln(1-qx1)+ln(1-qx5)))
drop *99 dth* qx0 qx0 qx1

rename (qx5)(eq5_19)
reshape long e , i(heading1 heading2 loc sex year) j(ageg) string
replace e = e * 1000
/*
egen id = group(ageg heading1 heading2 loc sex)
egen group = cut(id) , group(12)
replace group = group + 1
*/

save temp, replace

********************************************************************************************************************************************
********************************************************************************************************************************************
*** Preparing height data
********************************************************************************************************************************************
********************************************************************************************************************************************

use iso3 year sex age pop if age==19 & inlist(year,2009,2019) & iso3!="" using "$data/unwpp/population and deaths/estimates/data.dta" , clear
merge m:1 iso using "$data/keys/location_keys/data.dta" , keepusing(NCD_RisC_country iso3 region subregion incomegr  location_label) nogen
gen country = NCD_RisC_country
gen age_group = age
merge 1:1 country sex year age_group using "$data\NCDRisc\height\data.dta" , nogen keepusing(mean_height)
keep if age==19 & inlist(year,2009,2019)

reshape wide mean_height pop , i(iso3 year age) j(sex)
replace mean_height3= (mean_height1*pop1+mean_height2*pop2)/(pop1+pop2)
reshape long mean_height pop  , i(iso3 year age) j(sex)
drop if mean_height==.

gen loc = location_label
gen heading1 = "Countries"
gen heading2 = region
save temp2, replace

* Aggregating by region/income groups
foreach r in region subregion incomegr {
preserve
collapse (mean) mean_height [aweight=pop] , by(`r' sex year age)
gen loc = `r'
gen heading1 = "Aggregates"
gen heading2 = "`r'"
append using temp2
save temp2, replace
restore
}

use temp2, clear
bys sex (mean_height): gen e = mean_height[_N]-mean_height
gen ageg = "hgap"
keep heading1 heading2 loc sex year ageg e iso3
append using temp // add mortality
save temp2, replace


********************************************************************************************************************************************
********************************************************************************************************************************************
*** Preparing math data
********************************************************************************************************************************************
********************************************************************************************************************************************


use location_label iso3 region using "$data/keys/location_keys/data.dta" , clear // OWID IDS?
rename iso3 code
replace code = "OWID_KOS" if code == "XKX"
merge 1:m code using "$data\OWID\academic-performance\data.dta", keep(match)
gen loc = location_label
replace code = "XKX" if code == "OWID_KOS"
rename code iso3
keep year score_math_both score_math_boys score_math_girls loc region iso3
rename (score_math_both score_math_boys score_math_girls)(e3 e1 e2)
reshape long e, i(loc year) j(sex)
drop if e==.

// closest to 10 years earlier than the most recent
bys loc sex (year): egen maxyear=max(year)
gen distance_from_maxyear=abs(maxyear-year-10)
bys loc sex (distance_from_maxyear): keep if _n==1 | year==maxyear
drop distance_from_maxyear maxyear

gen heading1 = "Countries"
gen heading2 = region
drop region
gen ageg="math"
sum e
replace e = `r(max)'-e

save temp, replace


********************************************************************************************************************************************
********************************************************************************************************************************************
*** Constructing terciles
********************************************************************************************************************************************
********************************************************************************************************************************************
/*
use iso3 year pop sex if iso3!="" & year==2023 & sex == 3 using  "$data/unwpp/population and deaths/estimates/data.dta" , clear
collapse (sum) pop , by(iso3)
save pop2023, replace
*/

use LocID iso3 year age sex qx if iso3!="" & year==2023 & sex == 3 using "$data/unwpp/life tables/estimates/data.dta", clear
merge 1:1 LocID year sex age using "$data/unwpp/population and deaths/estimates/data.dta", nogen keep(match) keepusing(pop)
* Calculate 20q0
gen u20m = ln(1 - qx) if age <20 
collapse (sum) u20m  pop , by(iso3 sex year)
keep if pop>5000
replace u20m = (1-exp(u20m))*1000
egen tercile = cut(u20m), group(3)
sum u20m if tercile == 0
local c1 = r(max)
sum u20m if tercile == 1
local c2 = r(max)
keep pop iso3
save pop, replace


/* collapse (min) min = u20m (max) max = u20m, by(sex tercile year)
reshape wide min max, i(sex year) j(tercile)
gen ageg="u20m"
save terciles, replace */

********************************************************************************************************************************************
********************************************************************************************************************************************
*** Finalize the data
********************************************************************************************************************************************
********************************************************************************************************************************************

use temp, replace
append using temp2 // add the height and the mortality
 
replace heading2 = "World Bank Income groups" if heading2 == "incomegr"
replace heading2 = "UN subregions" if heading2 == "subregion"
replace heading2 = "UN regions" if heading2 == "region"
replace heading1 = "Countries and territories" if strpos(heading1, "Countries")

// location ids for the selection tree
merge m:1 heading1 heading2 loc using locids, keepusing(lid) keep(match) nogen
rename e value
drop if value==.

gen tercile = 1     if value<=`c1' & sex==3 & ageg=="u20m" & year == 2023
replace tercile = 2 if value> `c1' & value<=`c2' & sex==3 & ageg=="u20m"  & year == 2023
replace tercile = 3 if value> `c2' & sex==3 & ageg=="u20m"  & year == 2023
bys lid (tercile): replace tercile = tercile[1] 
 
bys lid sex ageg (year): gen projected2050 = value[_N]*((value[_N]/value[1])^((2050-year[_N])/(year[_N]-year[1]))) if year[_N]-year[1]!=0
bys lid sex ageg (year): gen x = (value[_N]/2)/projected2050
gen prospect = 2 if x>=1 & x<.
replace prospect = 1 if x>0.8 & x< 1
replace prospect = 0 if x<=0.8
replace prospect = 2 if projected2050 == 0
/*
merge m:1 iso3 using pop2023, keep(master match) nogen
drop if pop<5000 & heading1!="Aggregates"
*/
replace value = 0.1 if value == 0



drop loc heading1 heading2 loc iso3 projected2050 x iso3
compress
export delimited "$output_dir\main5data" , replace

duplicates drop lid, force
keep lid
save haspisa, replace

use locids , clear

br if lid == 34