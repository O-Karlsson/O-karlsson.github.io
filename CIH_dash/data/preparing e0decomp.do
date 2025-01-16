global dir "C:\Users\Om\OneDrive\Everything\Work in progress\DashDEV\CIH_dash\data\"
global data "C:\Users\Om\OneDrive\Everything\Work in progress\CIH\deomposition paper\"
global dataORG "C:\Users\Om\OneDrive\Everything\Work in progress\CIH\data\"

cd "$dir\"

use "$data\estimates" , clear
br if bench=="2000" & year==2019 & causename=="Collective violence and legal intervention"
drop if type=="_All0"
keep if inlist(year,2000,2010,2019,2021)
*drop if detail==1
drop if strpos(iso3,"*")
save temp, replace

keep if bench=="NA"
drop P
rename diffP P
replace bench="NA2"
append using temp

drop diffP
replace P = -P if !strpos(bench,"NA")

gen temp=-abs(P)


bys bench iso3 year sex type (temp): drop if _n>5 & type=="Other"

bys bench iso3 year sex type (temp): gen nr= _N
tab nr if type=="Other"

sort type ghecause
drop if Pgap<1 & strpos(bench,"NA")
sort country year sex causename

tab region
replace causename = "Total" if strpos(type,"_")
replace type= "I8 priority conditions" if type =="CCD"
replace type= "NCD7 priority conditions" if type =="NCD"
replace type= "All other causes (top 5 out of 117)" if type =="Other"

gen Sex="male" if sex == 1
replace Sex="female" if sex==2
replace Sex = "both" if sex == 3


egen smax = max(strlen(causename)) if !strpos(type, "other")
local sm = smax[1]
levelsof causename if length(causename)>`sm' , local(clvl)
foreach c in `clvl' {
dis "//" length("`c'")
dis `"replace causename = "" if causename == "`c'""'
}
local sm = smax[1]
dis `sm'
//37
replace causename = "Alzheimer's/other dementias" if causename == "Alzheimer disease and other dementias"
//32
replace causename = "Brain/nervous system cancers" if causename == "Brain and nervous system cancers"
//41
replace causename = "Cardiom./myocard./endocard." if causename == "Cardiomyopathy, myocarditis, endocarditis"
//42
replace causename = "Collect. violence/legal int." if causename == "Collective violence and legal intervention"
//29
replace causename = "Mechanical forces exposure" if causename == "Exposure to mechanical forces"
//29
replace causename = "Fire, heat & hot substances" if causename == "Fire, heat and hot substances"
//36
replace causename = "Gallbl./biliary tract cancer" if causename == "Gallbladder and biliary tract cancer"
//37
replace causename = "Liver canc. sec. to alc. use" if causename == "Liver cancer secondary to alcohol use"
//31
replace causename = "Melan./other skin cancers" if causename == "Melanoma and other skin cancers"
//40
replace causename = "Other COVID-19 pand.-related" if causename == "Other COVID-19 pandemic-related outcomes"
//43
replace causename = "Oth. endocr./blood/imm. dis." if causename == "Other endocrine, blood and immune disorders"
//31
replace causename = "Other musculoskeletal dis." if causename == "Other musculoskeletal disorders"
//29
replace causename = "Other neurological cond." if causename == "Other neurological conditions"
//42
replace causename = "Paral. ileus/intest. obst." if causename == "Paralytic ileus and intestinal obstruction"
//31
replace causename = "Sickle cell dis. and trait" if causename == "Sickle cell disorders and trait"

//32
replace causename = "Gallbladder and biliary dis." if causename == "Gallbladder and biliary diseases"
//46
replace causename = "Other hgp/hemolytic anemia" if causename == "Other haemoglobinopathies and hemolytic anemia"
//30
replace causename = "Other nutritional def." if causename == "Other nutritional deficiencies"

levelsof causename if !strpos(type,"other"), local(clvl)
foreach c in `clvl' {
dis "`c'"
}
keep type causename P country Sex year  bench region iso3 detail exobs exb




rename (Sex)(sex)


preserve
keep if !strpos(bench,"NA")
// this might get confusing
/* there are two types of figures , gap in e0 and change in e0 the change is over period
As it was is in the data, it's specified by the end year. 
2019 is both compared to 2000 and 2010. This sets the full period comparison to the earlier year (2000) 
Maybe consider making the year variable a string so it's less confusing */
replace year = 2000 if bench == "2000" & year == 2019

rename P T
save temp, replace
restore

preserve
keep if bench=="NA2"
rename P P_no0
drop bench
save temp2, replace
restore
keep if bench=="NA"
drop bench

merge 1:1 region country year sex causename type using temp, nogen
merge 1:1 region country year sex causename type using temp2, nogen


save temp, replace


duplicates drop country sex year , force

/* the change figures should show life expectacny in the benchmark (ie at baseline)  
rather than in the target year. The gap figures should show life expectacny in the target location
and not the benchmark */

replace type = "THE E0" 
replace causename = "THE E0"
drop P detail T P_no0
rename (exobs exb)(P T) // it's stored in P or T
gen P_no0 = P

append using temp

replace country=subinstr(country," & ", " and ",.)

foreach r in world region aregion1 aregion2 aregion3 ldc sids eu27 idb wbinc {
replace country = subinstr(country, "`r'::","",.)
}

gen rtype = substr(region, 1, strpos(region,"::")-1)

replace region = "Other aggregates" if inlist(rtype, "ldc", "sids", "eu27", "idb")
replace region = "World Bank income groups" if rtype == "wbinc"
replace region = "UN regions" if rtype == "aregion1" 
replace region = "UN sub-regions" if rtype == "aregion2"
replace region = "UN intermediate regions" if rtype == "aregion3" 
replace region = "CIH region" if inlist(rtype,"region","world") 
replace region = "CIH region" if inlist(iso3,"USA","IND","CHN")

replace country = " " + country if strpos(rtype, "aregion")

foreach var in P P_no0 T {
gen s`var' = string(`var',"%9.4f")
replace s`var' = "" if `var'==.
drop `var'
rename s`var' `var'
}
drop iso3 rtype bench region exobs exb
compress
export delimited using "e0decomp.csv" , replace


import delimited using "e0decomp.csv" , clear