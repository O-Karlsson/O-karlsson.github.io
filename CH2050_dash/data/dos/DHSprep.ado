program define DHSprep
syntax , data(string) dir(string) group(integer) set(string) [test(string)] [keeplist(string)] [must(string)] year(integer)

cd "`dir'"

capture erase `set'_`group'.dta
clear
gen del=.
save `set'_`group', replace

capture erase labels_`set'_`group'.txt
capture file close labels_`set'_`group'
file open labels_`set'_`group' using labels_`set'_`group'.txt, write text replace

local yr hv007		
if inlist("`set'","IR","BR") local yr v007

use "files_`set'" ,clear
levelsof filename if group == `group' , local(files)
foreach p in  `files' {

use "`p'" , clear

local fl = substr("`p'",-12,.)

capture sum `yr'
if _rc != 0 local min = 10000
else if _rc == 0 local min = r(min)

if substr(lower("`fl'"),1,2)=="np" local min=`min'-57
if substr(lower("`fl'"),1,2)=="af" local min=`min'+621
if substr(lower("`fl'"),1,2)=="et" local min=`min'+8
if `min' == 0 local min = 2000
if `min'<100 local min = 1900+`min'

if `min'>=`year' { 

local ifs = 1
foreach var in `must'   {
capture count if `var'!=.
if _rc==0 local ifs=`r(N)'
else if _rc!=0 local ifs = 0
}


if `ifs'!= 0 {

if "`keeplist'"!="" {
ds_util
local varlist `r(varlist)'
local drop `: list varlist-keeplist'
drop `drop'
}

gen file = upper(substr("`fl'",1,6))
compress

************************************************************************************
************************************************************************************
************************************************************************************
*** Getting variable and value labels for comparison *******************************
************************************************************************************
************************************************************************************

foreach var of varlist * {

local str num
capture confirm numeric variable `var'
if _rc!=0 local str str

if "`str'"=="str" count if `var'!=""
if "`str'"!="str" count if `var'!=.
if r(N)!=0 {

capture local lab `:variable label `var''
if _rc == 0 local lab "`:variable label `var''"
capture local lab = subinstr(`"`lab'"', "`", "",.)
capture local lab = subinstr(`"`lab'"', "'", "",.)
capture local lab = subinstr(`"`lab'"', `"""', "",.)
capture local lab = subinstr("`lab'", "`", "",.)
capture local lab = subinstr("`lab'", "'", "",.)
capture local lab = subinstr("`lab'", `"""', "",.)

if "`str'" == "num" {
local lbe : value label `var'
if "`lbe'"!="" {
capture levelsof `var', clean local(vlvl) // so it won't inlude 'empty' value labels
*capture labelsof `lbe', label
if _rc ==0 { 
foreach t in `vlvl' {
local v: label `lbe' `t'
capture local v = subinstr(`"`v'"', "`", "",.)
capture local v = subinstr(`"`v'"', "'", "",.)
capture local v = subinstr(`"`v'"', `"""', "",.)
capture local v = subinstr("`v'", "`", "",.)
capture local v = subinstr("`v'", "'", "",.)
capture local v = subinstr("`v'", `"""', "",.)
if "`v'"!="" file write labels_`set'_`group' "`fl'%%%`var'%%%`lab'%%%`t'%%%`v'%%%`str'" _n
}
}
}
if "`lbe'"==""  file write labels_`set'_`group' "`fl'%%%`var'%%%`lab'%%%.%%%novallab%%%`str'" _n
}
}
}
************************************************************************************
************************************************************************************
************************************************************************************



append using `set'_`group'
save `set'_`group', replace
}
}
}
file close labels_`set'_`group'
end
