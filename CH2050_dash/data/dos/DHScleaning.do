global output_dir "C:\Users\Karls\OneDrive\Work in progress\2025-01-15 GitRepos\O-karlsson.github.io\CH2050_dash\data"
global dir "C:\Users\Karls\OneDrive\Work in progress\2025-01-15 GitRepos\O-karlsson.github.io\CH2050_dash\data\tempfiles"
global data "C:\Users\Karls\OneDrive\Everything\data\data-warehouse\data\cleaned"
capture mkdir "$output_dir"
cd "$dir"
sysdir set PERSONAL "$output_dir\\dos"

import delimited "$data\DHS\metadata.csv", clear 
duplicates drop filename, force
gen file = subinstr(upper(filename), "DT.ZIP","",.)
duplicates tag file, gen(dup)
keep file surveynum dhs_countrycode countryname surveyyear dhs_countrycode
drop if surveynum==156 & substr(file,1,2)!="IA"
compress
save "$dir\DHS_zipfilname_cc_surveyid.dta", replace

********************************************************************************
*** Identifying IR datasets and appending
********************************************************************************

filelist, dir("$data\DHS\Individual Recode") pattern(*.dta)
save temp, replace
filelist, dir("$data\DHS\Individual Recode") pattern(*.DTA)
append using temp
sort fsize
gen group  = mod(_n,16)+1
replace filename = dirname+"\"+filename
keep filename group
compress
save files_IR, replace

clear all
parallel initialize  16 , force
program def myprogram
forval i = 1/16 {
if	($pll_instance == `i') DHSprep, dir($dir ) group(`i') data($data ) set(IR) year(1980) keeplist(caseid v000 v001 v002 v003 v005 v006 v007 v008 v009 v010 v011 v012 v438 v439 v440 v441 v442 v443 v444 v444a) must(v438)
}
end
parallel, nodata processors(8) prog(myprogram): myprogram

use IR_1 , clear
forval i = 2/16 {
append using IR_`i'
}
drop del
merge m:1 file using DHS_zipfilname_cc_surveyid.dta, nogen keep(match) keepusing(surveynum dhs_countrycode countryname) // those in master only are indian states 
sum 
save IR, replace

clear
gen cms = .
save dhscm, replace

use IR , clear
keep if inrange(v012, 21,40)
gen yob = v010
replace yob = 1900+yob if yob<100
replace yob = yob - 57 if countryname == "Nepal"
replace yob = yob + 8 if countryname == "Ethiopia"
replace yob = yob + 621 if countryname == "Afghanistan"
gen cm = v438/10 if inrange(v438, 700,2400)
drop if cm == .
keep cm yob dhs_countrycode v005

levelsof dhs_countrycode, local(clvl)
foreach c in `clvl' {
preserve
keep if dhs_countrycode == "`c'" 
sum yob 
local points = r(max)-r(min)+1
local bs = (r(max)-r(min))*0.25
lpoly cm yob [aweight=v005] , gen(year cms) nograph degree(1) n(`points')  kernel(biweight)  bwidth(10)  
drop if year+cms==.
keep year cms dhs_countrycode
append using dhscm
save dhscm, replace
restore
}

