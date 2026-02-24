* Based on Tom's
program define synth
syntax , dir(string) group(integer) sensitivity(string)
cd "`dir'"

capture erase para_`group'_`sensitivity'
clear
gen del = .
save para_`group'_`sensitivity' , replace

use if group == `group' using BR, clear

levelsof surveynum , local(slvl) 
foreach s in `slvl' {
forval wii = 0/5 {

preserve
keep if surveynum == `s'
if `wii'!=0 keep if wi==`wii'


// lower and upper bounds for age intevals
egen ageint = cut(b7), at(0,1,3,6,12,24,36,48,60)
gen agend = 1 if ageint== 0
replace agend = 3 if ageint == 1
replace agend = 6 if ageint == 3
replace agend = 12 if ageint == 6
replace agend = 24 if ageint == 12
replace agend = 36 if ageint == 24
replace agend = 48 if ageint == 36
replace agend = 60 if ageint == 48

// died outside the period
*drop if b3+agend<v008-60
drop if b3+agend<v008-120

// age intervals
scalar nageints=8
scalar length_1=1
scalar length_2=2
scalar length_3=3
scalar length_4=6
scalar length_5=12
scalar length_6=12
scalar length_7=12
scalar length_8=12

scalar start_1=0
local i=2
while `i'<=nageints+1 {
local iminus1=`i'-1
scalar start_`i'=start_`iminus1'+length_`iminus1'
local i=`i'+1
}

local i=1
while `i'<=nageints {
local iplus1=`i'+1
scalar end_`i'=start_`iplus1'
local i=`i'+1
}


gen start_month=v008-120
*gen start_month=v008-60
gen end_month=v008-1

gen age_at_death=b7
replace age_at_death=. if age_at_death>end_month
replace age_at_death=. if age_at_death>59

gen age_int_at_death=.
gen dod_1=.
gen dod_2=.

local i=1
while `i'<=nageints {
replace age_int_at_death=`i' if age_at_death>=start_`i' & age_at_death<=end_`i'-1
replace dod_1=b3+start_`i'  if age_int_at_death==`i'
replace dod_2=b3+end_`i'    if age_int_at_death==`i'
local i=`i'+1
}
replace dod_2=end_month if dod_1<= end_month & dod_2>end_month & end_month==v008-1

local i=1
while `i'<=nageints {
gen died`i'=.

* age interval is entirely in the time window
replace died`i'=1  if age_int_at_death==`i' &  dod_2<=end_month   & dod_1>=start_month

* age interval is partly in the time window and partly in the previous time window
replace died`i'=.5 if age_int_at_death==`i' &  dod_2>=start_month & dod_1< start_month 

* age interval is partly in the time window and partly in the next time window
replace died`i'=.5 if age_int_at_death==`i' &  dod_2> end_month   & dod_1<=end_month

gen risk`i'=.

* age interval is entirely in the time window
replace risk`i'=1  if (age_int_at_death>=`i' | age_at_death==.) & b3+end_`i'<=end_month   & b3+start_`i'>=start_month

* age interval is partly in the time window and partly in the previous time window
replace risk`i'=.5 if (age_int_at_death>`i'  | age_at_death==.) & b3+end_`i'>=start_month & b3+start_`i'< start_month 

* age interval is partly in the time window and partly in the next time window
replace risk`i'=.5 if (age_int_at_death>`i'  | age_at_death==.) & b3+end_`i'> end_month   & b3+start_`i'<=end_month

* child dies in this interval
* age interval is partly in the time window and partly in the previous time window
replace risk`i'=.5 if age_int_at_death==`i' & end_`i'>=start_month & b3+start_`i'< start_month 

* age interval is partly in the time window and partly in the next time window
replace risk`i'=.5 if age_int_at_death==`i' & end_`i'> end_month   & b3+start_`i'<=end_month

* Next line will change risk from 0 to .5 for a potential handful of cases in which died=.5 and risk=0;
*   it ensures a perfect match with the DHS programs.
replace risk`i'=.5 if died`i'==.5 

* the preceding lines produce some values of died and risk that should be changed from missing to 0
replace died`i'=0 if died`i'==. & risk`i'>0 & risk`i'<=1
replace risk`i'=0 if risk`i'==. & died`i'>0 & died`i'<=1

replace risk`i'=1 if died`i'==1

local i=`i'+1
}

* Define the five-year interval in terms of b19
gen risk_B=1 if b19>=0 & b19<=61

* Define the neonatal, early neonatal, and late neonatal deaths with WHO definitions
gen     died_NMR28=0 if risk_B==1
replace died_NMR28=1 if risk_B==1 & b6<128

* Deaths in the first 7 days
gen     died_ENMR=0 if risk_B==1
replace died_ENMR=1 if risk_B==1 & b6<107

* Deaths in the first 28 days but not in the first 7 days
gen     died_LNMR=0 if risk_B==1
replace died_LNMR=1 if risk_B==1  & inrange(b6,107,127)

sort surveynum caseid bidx
egen childid=group(surveynum caseid v024 bidx)
keep *id died* risk* v005 v024 v001 v000 surveyyear surveynum wi countryname

svyset v001 [pweight=v005]
foreach lt in ENMR LNMR  {
svy: glm died_`lt', family(binomial risk_B) link(logit) iter(50)
matrix T=r(table) 
scalar s`lt'  =exp(T[1,1])/(1+exp(T[1,1]))
scalar s`lt'_L=exp(T[5,1])/(1+exp(T[5,1])) // these are identical to logit transformed CIs from eg proportion
scalar s`lt'_U=exp(T[6,1])/(1+exp(T[6,1]))
}

reshape long died risk, i(childid) j(age)
svyset v001 [pweight=v005]

svy: glm died_NMR28, family(binomial risk_B) link(logit) iter(50)
estimates store NMR28
scalar sNMR28  =exp(T[1,1])/(1+exp(T[1,1]))
scalar sNMR28_L=exp(T[5,1])/(1+exp(T[5,1])) // these are identical to logit transformed CIs from eg proportion
scalar sNMR28_U=exp(T[6,1])/(1+exp(T[6,1]))

* Estimate the 8 q's
svy: glm died ibn.age, nocons family(binomial risk) link(logit) iter(50)
estimates store e

forvalues la=1/8 {	
local lterm`la'="1/(1+exp(_b[`la'.age]))"
local qterm`la'= "1-(`lterm`la'')"
local q`la'= exp(_b[`la'.age])/(1+exp(_b[`la'.age]))
}

// probabilities from birth
local lr1 ="(1-`lterm1')"  // NMR 
local lr2 ="(1-`lterm1'*`lterm2'*`lterm3'*`lterm4')" // IMR 
local lr3 ="(1-`lterm1'*`lterm2'*`lterm3'*`lterm4'*`lterm5'*`lterm6'*`lterm7'*`lterm8')" // U5MR

// age distribution
local lr4  ="`lr2'-`lr1'" // PN
local lr5  ="`lr3'-`lr2'" // CH

forval nt = 1/5 {
estimates restore  e
capture noi nlcom (`lr`nt'') , post iter(50)
if `nt'==2 estimates store EIMR

if _rc == 0 {
scalar b`nt' = _b[_nl_1]
scalar se`nt' = _se[_nl_1]
}

else if _rc!= 0 {
scalar b`nt' = `lr`nt''
scalar se`nt' = .
}
}

suest e NMR28
local lNMR28 = "exp(_b[NMR28_died_NMR28:_cons])/(1+exp(_b[NMR28_died_NMR28:_cons]))"
nlcom `lr2'-`lNMR28', post iter(50)
scalar b6 = _b[_nl_1]
scalar se6 = _se[_nl_1]

* Save a line of results
keep if _n==1
keep surveyyear surveynum wi countryname

local ln=1
foreach lt in NMR IMR U5MR PN CH EPP28  {
gen `lt' = b`ln'*1000
gen `lt'_U=invlogit(ln(b`ln'/(1-b`ln'))+((1.96*se`ln')/(b`ln'*(1-b`ln'))))*1000
gen `lt'_L=invlogit(ln(b`ln'/(1-b`ln'))-((1.96*se`ln')/(b`ln'*(1-b`ln'))))*1000
local ln=`ln'+1
}

foreach lt in ENMR LNMR NMR28 {
gen `lt'  =1000*s`lt'
gen `lt'_L=1000*s`lt'_L
gen `lt'_U=1000*s`lt'_U
}
replace wi = `wii'
keep dhs_countrycode surveynum wi ENMR* LNMR* NMR28* NMR* IMR* U5MR* PN* CH* EPP28*
append using para_`group'_`sensitivity'
save para_`group'_`sensitivity' , replace
restore
}
}
end