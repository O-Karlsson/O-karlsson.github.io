global output_dir "C:\Users\Karls\OneDrive\Work in progress\2025-01-15 GitRepos\O-karlsson.github.io\CH2050_dash\data"
global dir "C:\Users\Karls\OneDrive\Work in progress\2025-01-15 GitRepos\O-karlsson.github.io\CH2050_dash\data\tempfiles"
global data "C:\Users\Karls\OneDrive\Everything\data\data-warehouse\data\cleaned"
capture mkdir "$dir"
cd "$dir"
sysdir set PERSONAL "$output_dir\dos"

import delimited "$data\DHS\metadata.csv", clear 
duplicates drop filename, force
gen file = subinstr(upper(filename), "DT.ZIP","",.)
duplicates tag file, gen(dup)
keep file surveynum dhs_countrycode countryname surveyyear dhs_countrycode
drop if surveynum==156 & substr(file,1,2)!="IA"
compress
save DHS_zipfilname_cc_surveyid.dta, replace

****************************************************************************
*** Identifying WI datasets and appending
********************************************************************************

filelist, dir("$data\DHS\Wealth Index") pattern(*.dta)
save temp, replace
filelist, dir("$data\DHS\Wealth Index") pattern(*.DTA)
append using temp
sort fsize
gen group  = mod(_n,16)+1
replace filename = dirname+"\"+filename
keep filename group
compress
save files_WI, replace

clear all
parallel initialize  16 , force
program def myprogram
forval i = 1/16 {
if	($pll_instance == `i') DHSprep, dir($dir ) group(`i') data($data ) set(WI) year(1980)
}
end
parallel, nodata processors(8) prog(myprogram): myprogram

use WI_1 , clear
forval i = 2/16 {
append using WI_`i'
}
drop del
merge m:1 file using DHS_zipfilname_cc_surveyid.dta, nogen keep(match) keepusing(surveynum)
rename whhid hhid
replace hhid = trim(hhid)
save WI, replace 

********************************************************************************
*** Identifying BR datasets and appending
********************************************************************************

filelist, dir("$data\DHS\Births Recode") pattern(*.dta)
save temp, replace
filelist, dir("$data\DHS\Births Recode") pattern(*.DTA)
append using temp
sort fsize
gen group  = mod(_n,16)+1
replace filename = dirname+"\"+filename
keep filename group
compress
save files_BR, replace

clear all
parallel initialize  16 , force
program def myprogram
forval i = 1/16 {
if	($pll_instance == `i') DHSprep, dir($dir ) group(`i') data($data ) set(BR) year(1980) keeplist(v190 v191 caseid v000 v001 v002 v003 v005  v006 v007 v008 v009 v011 v012 v016 v106 v021 v022 v023 v024 v135 b1 b2 b3 b4 b5 b6 b7 b8 b10 b11 b13 b17 b18 b19  bidx v201  bord m18 hw16)
}
end
parallel, nodata processors(8) prog(myprogram): myprogram

use BR_1 , clear
forval i = 2/16 {
append using BR_`i'
}
merge m:1 file using DHS_zipfilname_cc_surveyid.dta, nogen keep(match) keepusing(surveynum dhs_countrycode countryname surveyyear) // those in master only are indian states 


// Don't consider those that have ID issues (can try to salvage some)
bys surveynum caseid bidx: gen N = _N
bys surveynum: egen noN = total(N!=1)
drop if noN!=0
drop del N noN
save BR, replace

// Preparing the BR to merge WI where missing
use BR , clear
keep if v190==.
keep caseid surveynum v007 v001 v002 v003 bidx
gen hhid = trim(substr(caseid,1,12))

// Only consider these where HHID works as ID (can try to salvage some later)
bys surveynum hhid v003 bidx: gen N = _N
bys surveynum: egen noN = total(N!=1)
keep if noN==0
drop N noN

merge m:1 surveynum hhid using WI, keep(match) nogen // don't bother with the v001 v002
save hhidmatch, replace

use BR , clear
merge 1:1 surveynum caseid bidx using hhidmatch, nogen keep(master match)
gen wi = v190
replace wi = wlthind5 if wi==.
bys surveynum: egen any = max(wi!=.)
drop if any==0
drop if wi==.

gen day_of_birth=hw16
replace day_of_birth=15 if hw16>31 
replace day_of_birth=int((day_of_birth+hw16)/2) if v007==b2 & v006==b1 & day_of_birth<hw16 & hw16<=31 // & hw16<=31 was added
gen doi=mdy(v006,v016,v007)
gen dob=mdy(b1,day_of_birth,b2)
replace b19=int((doi-dob)/(365.25/12)) if b19==.
*replace b19 = v008 - b3 if dhs_countrycode=="af" // look into this!
replace b19 = v008 - b3 if b19 == .
bys file: egen maxage= max(b19)

// Five year window
*drop if maxage<120
*drop if b3+60<v008-61

// Ten year window
drop if maxage<180
drop if b3+60<v008-121

egen ageint = cut(b7), at(0,1,3,6,12,24,36,48,60)
bys ageint (b7): egen agend=max(b7)
replace agend =agend+1
replace agend = . if agend>60


drop if b3+agend<v008-120
*drop if b3+agend<v008-60
drop if b3>v008-1
drop day* doi dob

preserve
collapse (count) N = v001	, by(surveynum)
sort N
gen group  = mod(_n,14)+1
drop N
save temp, replace 
restore
merge m:1 surveynum using temp, nogen
save temp, replace
/*
use temp , clear
*/
drop if surveynum == 490 // look into this
keep bidx v001 v002 v003 v005 v008 v024 b3 b6 b7 b19 countryname group surveyyear surveynum wi v000 caseid
save BR, replace

clear all
parallel initialize  14 , force
program def myprogram
forval i = 1/14 {
if	($pll_instance == `i') synth, dir("$dir") group(`i')  sensitivity(none)
}
end
parallel, nodata processors(8) prog(myprogram): myprogram


use para_1_none , clear
forval i = 2/14 {
append using para_`i'_none
}
label define wi 0 "Pooled" 1 "Poorest" 2 "Poorer" 3 "Middle" 4 "Richer" 5 "Richest" , replace
label val wi wi

save estimates , replace

use location_label dhs_countrycode region if dhs_countrycode!="" using "$data/keys/location_keys/data.dta" , clear
save temp , replace
use dhs_countrycode countryname using DHS_zipfilname_cc_surveyid.dta , clear
duplicates drop dhs_countrycode, force
merge 1:1 dhs_countrycode using temp, nogen keep(match)
save temp , replace


use estimates, clear
merge m:1 countryname using temp, keep(match)
rename (surveyyear location_label)(year loc)
gen PNM = IMR-NMR
gen heading2 = region
gen heading1 = "Countries and territories"

keep NMR PNM CH year loc wi heading1 heading2
drop if wi==0
compress
save wimort, replace
