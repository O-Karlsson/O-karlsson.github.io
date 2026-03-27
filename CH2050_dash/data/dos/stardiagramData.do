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

// The neonatal mortality from GBD
use location_label subregion region incomegr  location_id iso3 if location_id!=.  using "$data/keys/location_keys/data.dta" , clear // location_id is a IHME specific location identifier, IHME doesn't include iso3
merge 1:m location_id using "$data/GBD/Number of deaths all causes before age 28 days and before age 1 year for all countries\data", keep(match) nogen keepusing(sex year dth1 dthn)
drop location_id
gen age = - 1 
keep if inlist(year,2013,2023)
save temp, replace

use LocID iso3 mx year age sex qx ax if iso3!="" & age<20  using "$data/unwpp/life tables/estimates/data.dta" , clear
append  using "$data/unwpp/life tables/projections/data.dta", keep(LocID iso3 mx year age sex qx ax iso3)
keep if iso3!="" & age<20 & inlist(year,2013,2023)

merge 1:1 LocID year sex age using "$data/unwpp/population and deaths/estimates/data.dta" , nogen keep(master match) keepusing(exposure) // need the 'expsoure' variable to aggregate
rename exposure exp
merge 1:1 LocID year sex age using "$data/unwpp/population and deaths/projections/data.dta" , nogen keep(master match) keepusing(exposure) // need the 'expsoure' variable to aggregate
replace exposure = exp if exposure == .
merge m:1 iso3 using "$data/keys/location_keys/data.dta" , keepusing(location_label subregion region incomegr  location_id iso3) nogen keep(match) // matches iso3 to regions/subregions/income groups
append using temp
tab age

gen heading1 = "Countries" // heading1 is the static heading on the dashboard
gen heading2 = region // heading two is the collapseble heading on the dashboard
gen loc = location_label // the locations
save temp, replace

* Aggregating by region/income groups
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
collapse (sum) qx dth1 dthn , by(heading1 heading2 loc sex year ageg)
replace qx = (1-exp(qx))*1000
replace ageg = 99 if ageg==-1
reshape wide qx dth1 dthn , i(heading1 heading2 loc sex year) j(ageg)

gen ennm = qx0*dthn99/dth199

gen epnm = (1-exp(ln(1-qx0/1000)+ln(1-qx1/1000)-ln(1-ennm/1000)))*1000
drop *99 dth* qx0 qx0 qx1

rename (qx5)(eq5_19)
reshape long e , i(heading1 heading2 loc sex year) j(ageg) string

egen id = group(ageg heading1 heading2 loc sex)
egen group = cut(id) , group(12)
replace group = group + 1
save temp, replace

use iso3 year sex age pop if age==19 & inlist(year,2009,2019) & iso3!="" & sex!=3 using "$data/unwpp/population and deaths/estimates/data.dta" , clear
merge m:1 iso using "$data/keys/location_keys/data.dta" , keepusing(NCD_RisC_country iso3 region subregion incomegr  location_label) nogen
gen country = NCD_RisC_country
gen age_group = age
merge 1:1 country sex year age_group using "$data\NCDRisc\height\data.dta" , keep(match) nogen keepusing(mean_height)

bys country sex (mean_height): egen max = max(mean_height)
bys sex year (max): replace max = . if _n<=_N-10
sum max if year == 2019
gen e = `r(max)'-mean_height if sex == 1
replace e = `r(min)'-mean_height if sex == 2
drop max
reshape wide mean_height e pop , i(iso3 year age) j(sex)
gen mean_height3= (mean_height1*pop1+mean_height2*pop2)/(pop1+pop2)
gen e3= (e1*pop1+e2*pop2)/(pop1+pop2)
gen pop3 = pop1+pop2
reshape long mean_height e pop  , i(iso3 year age) j(sex)
gen loc = location_label
gen heading1 = "Countries"
gen heading2 = region
save temp2, replace

* Aggregating by region/income groups
foreach r in region subregion incomegr {
preserve
collapse (mean) mean_height e [aweight=pop] , by(`r' sex year age)
gen loc = `r'
gen heading1 = "Aggregates"
gen heading2 = "`r'"
append using temp2
save temp2, replace
restore
}

use temp2, clear
gen ageg = "hgap"
keep heading1 heading2 loc sex year ageg e
append using temp
drop id group
save temp2, replace

use location_label iso3 region using "$data/keys/location_keys/data.dta" , clear // location_id is a IHME specific location identifier, IHME doesn't include iso3
rename iso3 code
replace code = "OWID_KOS" if code == "XKX"
merge 1:m code using "$data\OWID\academic-performance\data.dta", keep(match)
gen loc = location_label
keep year score_math_both score_math_boys score_math_girls loc region
rename (score_math_both score_math_boys score_math_girls)(e3 e1 e2)
reshape long e, i(loc year) j(sex)
drop if e==.

*bys loc sex (year): keep if _n==1 | _n == _N

bys loc sex (year): egen maxyear=max(year)
gen distance_from_maxyear=abs(maxyear-year-10)
bys loc sex (distance_from_maxyear): keep if _n==1 | year==maxyear
drop distance_from_maxyear maxyear



gen heading1 = "Countries"
gen heading2 = region
drop region
gen ageg="math"
save temp, replace
append using temp2
replace heading2 = "World Bank Income groups" if heading2 == "incomegr"
replace heading2 = "UN subregions" if heading2 == "subregion"
replace heading2 = "UN regions" if heading2 == "region"
replace heading1 = "Countries and territories" if strpos(heading1, "Countries")

merge m:1 heading1 heading2 loc using locids, keepusing(lid) keep(match) nogen
rename e value
drop if value==.
replace value = 564.5877-value if ageg=="math"

bys heading1 heading2 ageg loc (year): gen decline = value[_n-1]-value[1]
tab loc if decline<0 & ageg=="math" & sex == 3
sort loc year
br if sex==3 & ageg=="math" & inlist(loc,"Denmark","Finland","Belgium","United States","Russia","Estonia")
br if sex==3 & ageg=="hgap" & inlist(loc,"Denmark","Finland","Belgium","United States","Russia","Estonia")
br if sex==3 & ageg=="nnm" & inlist(loc,"Denmark","Finland","Belgium","United States","Russia","Estonia")


drop loc heading1 heading2 loc

compress
export delimited "$output_dir\stardata" , replace


duplicates drop lid, force
keep lid
save haspisa, replace
