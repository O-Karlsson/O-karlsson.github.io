
(async function () {

    // load full data if not already loaded
    fullData[datasetFile]=[];
    await loadFullData(datasetFile);    // function above

    selectedCountries.forEach(country => {
        selectedSex.forEach(sex => {
            selectedYears.forEach(year => {
                renderChart(fullData[datasetFile], containerId, country, sex, year, xAxisTitle, yVar, metric);
            })})})})();