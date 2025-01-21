global dir "C:\Users\Karls\OneDrive\Everything\Work in progress\DashDEV\CIH_dash\data\"
global data "C:\Users\\Karls\\OneDrive\Everything\Work in progress\CIH\data\"
cd "$dir"

use if loctype=="Country/Area" & year == 2023 using  "$data\\wpp_life_table_singleyr" , clear
bys iso3 year sex: egen tp = total(p)
drop country

merge m:1 iso3 using "$data\\regions",  keep(match) nogen
keep iso3 sex p qx x region year country tp ldc sids eu27 idb aregion1 aregion2 aregion3 wbinc
replace region = "" if inlist(iso3,"IND","CHN","USA")
gen world = "World"
save temp, replace

foreach r in world region aregion1 aregion2 aregion3 ldc sids eu27 idb wbinc {
preserve
keep if `r' != ""
collapse (mean) qx [aweight=p] , by(`r' sex year x)
rename `r' country
if inlist("`r'", "ldc", "sids", "eu27", "idb") gen region = "Other aggregates"
if "`r'" == "wbinc" gen region = "World Bank income groups"
if "`r'" == "aregion1" gen region = "UN regions"
if "`r'" == "aregion2" gen region = "UN sub-regions"
if "`r'" == "aregion3" gen region = "UN intermediate regions"
if inlist("`r'","region","world") gen region = "CIH region"
append using temp
save temp, replace
restore
}

use temp, clear
replace region = "CIH region" if  inlist(iso3,"IND","CHN","USA")

bys region country sex year (x): gen qa = 1-exp(sum(ln(1-qx)))
bys region country sex year (x): gen qas=qa[_n-1]*100
replace qas=. if x==0

bys region country sex year (x): gen qp70a = 1-exp(sum(ln(1-qx))) if x>=70
bys region country sex year (x): gen qp70=qp70a[_n-1]*100 if x>=70
replace qp70=. if x == 70

replace region = "CIH region" if country==region

gen Sex = "male" if sex == 1
replace Sex = "female" if sex == 2
replace Sex = "both" if sex == 3
drop sex
rename Sex sex
keep x country sex region qas year qx qp70
replace qx = qx*100
gen qa = string(qas,"%4.3f")
replace qa = "" if qas==.
gen nqx = string(qx,"%4.3f")
replace nqx = "" if qx==.

gen p70 = string(qp70,"%4.3f")
replace p70  = "" if qp70 ==.

*destring qa nqx p70, replace
drop qas qx qp70 year
rename (x)(age)
compress
replace country = " " + country if substr(region,1,2)=="UN"
sort region country  sex age
export delimited using "data_by_age", replace
