global dir "C:\Users\Om\OneDrive\Everything\Work in progress\DashDEV\CIH_dash\data\"
global data "C:\Users\\Om\\OneDrive\Everything\Work in progress\CIH\data\"
cd "$dir"


use if loctype=="Country/Area" using  "$data\\wpp_life_table_singleyr" , clear
bys iso3 year sex: egen tp = total(p)
drop country
merge m:1 iso3 using "$data\\regions",  keep(match) nogen
keep iso3 sex p mx ax x region year country tp nD ldc sids eu27 idb aregion1 aregion2 aregion3 wbinc
replace region = "" if inlist(iso3,"IND","CHN","USA")
gen world = "World"
save temp, replace

foreach r in world region aregion1 aregion2 aregion3 ldc sids eu27 idb wbinc {
preserve
keep if `r' != ""
collapse (mean) mx ax (rawsum) p nD [aweight=p] , by(`r' sex year x)
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

save temp, replace

gen workp = inrange(x,15,64)
collapse (sum) p nD , by(country region sex year workp)
reshape wide p nD , i(country region sex year) j(workp)
gen deaths = nD0+nD1
gen cdrs = deaths/(p1)*1000
gen cdr = deaths/(p0+p1)*1000
keep sex year cdr cdrs country region
save temp2, replace


use "$data\lt" , clear
drop if year>=1950
keep iso3 sex x year qx ax
merge m:1 iso3 using "$data\\regions",  keep(match) nogen keepusing(country region)
replace region = "CIH region" if  inlist(iso3,"IND","CHN","USA")

append using temp


// calculating life expectancy
gen double nqx = (1*mx)/(1+(1-ax)*mx)
replace nqx=qx if nqx==.
replace nqx = 1 if x==100
gen double lx = 100000 if x==0
bys country region sex year (x): replace lx = lx[_n-1]*(1-nqx[_n-1]) if x!=0
gen double ndx = nqx*lx
gen double nLx = ((lx-ndx)*1)+(ndx*ax)
replace nLx = lx/mx if x == 100
bys country region sex year: egen double Tx = total(nLx)
bys country region sex year (x): replace Tx=Tx[_n-1]-nLx[_n-1] if x!=0
gen double UNe0 = Tx/lx
keep if inlist(x,0,70)
bys country region sex year (x): gen UNppd = (100000-lx[_N])/1000
keep if x == 0
keep sex year UNppd UNe0 country region country region tp
merge 1:1 country region year sex using temp2, nogen
save temp, replace

foreach var in UNppd UNe0 cdr cdrs { 
use temp, clear
if inlist("`var'","UNe0") replace `var' = -`var'
bys country region: egen small = max(year==2023 & tp<3000 & sex==3)
drop if small == 1
bys  sex year (`var'): keep if _n==1
bys  sex (year): replace `var' = `var'[_n-1]   if `var'>=`var'[_n-1] & `var'[_n-1]<.
keep `var' year sex
if inlist("`var'","UNe0") replace `var' = -`var'
save temp_`var', replace
}

use temp_UNppd, clear
foreach var in UNe0 cdr cdrs { 
merge 1:1 sex year using temp_`var' , nogen
}
gen country = "Frontier (most favorable each year)"
gen region = "Other aggregates"

append using temp

gen Sex = "male" if sex == 1
replace Sex = "female" if sex == 2
replace Sex = "both" if sex == 3
drop sex
rename Sex sex

gen q70 = string(UNppd,"%4.1f")
replace q70="" if UNppd==.

gen e0 = string(UNe0,"%4.1f")
replace e0="" if UNe0==.

gen rcdr= string(cdr,"%4.1f")
replace rcdr="" if cdr==.

gen rcdrs= string(cdrs,"%4.1f")
replace rcdrs="" if cdrs==.

*destring q70  e0 rcdr rcdrs, replace
keep q70 country sex region year e0  rcdr rcdrs
compress
sort region country sex year

replace country = " " + country if substr(region,1,2)=="UN"


export delimited using "data_by_year", replace
