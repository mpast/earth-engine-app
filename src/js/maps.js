/**
 * Iniatialize map and add country polygons
 * @param mapId 
 * @param token 
 * @param countries 
 */
var initialize = function(map, mapId, token, countries, init) {
    if (init) {
        this.clearStorage();
        this.data_map = {};
    }
    this.removeListeners();

    this.map = this.createMap(mapId, token);

    this.countries = JSON.parse(countries);

    if (!this.drawing) {
        this.addCountries(this.countries);
    } else {
        if (this.polygon && this.drawingManager) {
            this.polygon.setMap(this.map);
            this.drawingManager.setMap(this.map);
        }
        this.allowDrawing();
        $("#menu-draw").show();
    }

    this.map.data.addListener("click", handleCountryClick.bind(this));

    this.attachListeners();

    $("#input-save-map").val(map);

    this.showMapInfo(map);

    this.getAllStatic(map);
    // this.saveCountriesCache(mapid);
    // this.saveCountriesStatic(mapid);
    $(window).on("load", function() {
        this.handleAbout();
    });
};

/**
 * Creates Earth Engine Map 
 * @param mapId 
 * @param token 
 */
function createMap(mapId, token) {
    var lat = sessionStorage.getItem("lat");
    var lng = sessionStorage.getItem("lng");
    if (!lat || !lng) {
        lat = 49.61;
        lng = 6.13;
    }
    var myLatLng = new google.maps.LatLng(parseFloat(lat), parseFloat(lng));
    var zoom = sessionStorage.getItem("zoom");
    if (!zoom) {
        zoom = 4;
    }

    var mapOptions = {
        center: myLatLng,
        zoom: parseInt(zoom),
        maxZoom: 30,
        streetViewControl: false
    };

    // Create base map from Google
    var map = new google.maps.Map(document.getElementById("map"), mapOptions);

    var eeMapOptions = {
        getTileUrl: function(tile, zoom) {
            var baseUrl = "https://earthengine.googleapis.com/map";
            var url = [baseUrl, mapId, zoom, tile.x, tile.y].join("/");
            url += "?token=" + token;
            return url;
        },
        tileSize: new google.maps.Size(256, 256)
    };
    var mapType = new google.maps.ImageMapType(eeMapOptions);

    // Add Earth Engine Map
    map.overlayMapTypes.push(mapType);

    return map;
}

/**
 * Use HTML5 Geolocalization and positions map using current localization
 * @param map 
 */
function useGeolocalization(map) {
    var infoWindow = new google.maps.InfoWindow({ map: map });

    // Try to use HTML5 Geolocalization
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            var pos = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            infoWindow.setPosition(pos);
            infoWindow.setContent("Location found");
            map.setCenter(pos);
        }, function() {
            console.log("Error with geolocation current position" + infoWindow);
        });
    } else {
        // The browser does not allow HTML5 Geolocalization
        console.log("Browser does not allow HTML geolocalization" + infoWindow);
    }
}

/**
 * Find a random color or returns one using identifier
 * @param colorId 
 */
function findRandomColor(colorId) {
    if (!colorId) {
        colorId = 1 + 6 * (1 + Math.floor(Math.random() * 100));
    }
    var colors = ["aqua", "black", "blue", "fuchsia", "gray", "green", "lime", "maroon", "navy", "olive", "orange", "purple", "red", "silver", "teal", "white", "yellow"];
    return colors[colorId % colors.length];
}

/**
 * Add countries geojson from files and generate polygons
 * @param countries 
 */
function addCountries(countries) {
    countries.forEach((function(country) {
        var json = sessionStorage.getItem(country);
        if (json) {
            this.map.data.addGeoJson(JSON.parse(json));
        } else {
            var jsonfile = "static/countries/" + country + ".geo.json";
            this.map.data.loadGeoJson(jsonfile);
            $.get(jsonfile, function(data) {
                try {
                    sessionStorage.setItem(country, JSON.stringify(data));
                } catch (e) {

                }
            });
        }

        this.map.data.setStyle(function(feature) {
            id = feature.j;
            var colorId = 0;
            for (var i = 0; i < id.length; i++) {
                colorId += id.charCodeAt(i);
            }
            var color = findRandomColor(colorId);
            return {
                fillColor: color,
                fillOpacity: .10,
                strokeColor: color,
                strokeWeight: 2
            };
        });
    }).bind(this));
}

/**
 * Remove countries from map
 */
function removeCountries() {
    this.map.data.forEach(function(feature) {
        map.data.remove(feature);
    });
}

/**
 * Register a click handler to show a panel when the user clicks on a place.
 * @param event 
 */
function handleCountryClick(event) {
    this.clear();
    var feature = event.feature;
    // Instantly higlight the polygon and show the title of the polygon.
    this.map.data.overrideStyle(feature, { strokeWeight: 4, fillOpacity: .5 });
    this.title = feature.f["name"];
    var url = "https://en.wikipedia.org/wiki/" + this.title;
    $("#panel-wiki").show().attr("href", url);

    var countryId = feature.j;
    var jsonfile = "static/countries/" + countryId + ".geo.json";

    var mapid = $("#input-save-map").val();
    this.getDetails(countryId, mapid);
};

/**
 * Asynchronously load and show chart about the country
 * @param countryId 
 * @param mapid 
 */
function getDetails(countryId, mapid) {
    $("#spinner").show();
    var that = this;
    var static = this.getStatic(countryId, mapid);
    if (!static) {
        $.get("/details/" + mapid + "/" + countryId)
            .done((function(data) {
                $("#spinner").hide();
                if (data) {
                    sessionStorage.setItem("data", data);
                }
                that.reloadChart(mapid, data);
            }).bind(this))
            .fail(function(xhr, status, error) {
                console.log("Error getDetails: " + error + " status: " + status);
                $("#spinner").hide();
                $("#dialog-text").text("Request error");
                $("#dialog").show();
            });
    }
}

/**
 * Get all precomputed data for mapid
 * @param mapid 
 */
function getAllStatic(mapid) {
    var that = this;
    localStorage.removeItem("map_data");
    $.get("/static/details/mapid_" + mapid + ".json")
        .done((function(data) {
            if (data) {
                try {
                    localStorage.setItem("map_data", JSON.stringify(data));
                } catch (e) {

                }
            }
        }).bind(this))
        .fail(function(xhr, status, error) {
            console.log("Error getAllDetails Static: " + error + " status: " + status);
        });
}

/**
 * Get precomputed data for current map and country
 * @param countryId 
 * @param mapid 
 */
function getStatic(countryId, mapid) {
    var data_map = JSON.parse(localStorage.getItem("map_data"));
    if (data_map) {
        $("#spinner").hide();
        var data = data_map[countryId];
        if (data) {
            sessionStorage.setItem("data", JSON.stringify(data));
        }
        this.reloadChart(mapid, data);
        return true;
    }
    return false;
}

/**
 * Get all static details from map
 * @param mapid 
 */
function getStaticAllDetails(mapid) {
    var data_map = JSON.parse(localStorage.getItem("map_data"));
    if (data_map) {
        this.showAllCharts(mapid, data_map);
        return true;
    }
    return false;
}

/**
 * Asyncronously get details from all countries
 * @param mapid 
 */
function getAllDetails(mapid) {
    $("#spinner").show();
    var details = getStaticAllDetails(mapid);
    if (!details) {
        $.get("/details/" + mapid)
            .done((function(data) {
                var json = JSON.parse(data);
                var error = false;
                if (json["error"]) {
                    $("#dialog-text").text(json["error"]);
                    $("#dialog").show();
                } else {
                    this.showAllCharts(mapid, json);
                }
            }).bind(this))
            .fail(function(xhr, status, error) {
                console.log("Error getAllDetails: " + error + " status: " + status);
                $("#spinner").hide();
                $("#dialog-text").text("Request error");
                $("#dialog").show();
            });
    }
}

/** 
 * Clears the details panel and selected country.
 */
function clear() {
    $("#panel-title").empty().hide();
    $("#panel-wiki").hide().attr("href", "");
    $("#panel-chart").empty().hide();
    $("#panel").hide();
    $("#panel-chart-line").hide();
    $("#panel-chart-bar").hide();
    $("#panel-chart-geo").hide();
    $("#panel-chart-histogram").hide();
    $("#panel-chart-pie").hide();
    $("#show-all-countries").hide();
    this.map.data.revertStyle();
}

/**
 * Asyncronously change map to the one with that id
 * @param id 
 */
function getMap(id) {
    $("#spinner").show();
    this.clear();
    $.get("/map/" + id)
        .done(function(elem) {
            $("#map").append(elem);
            $("#spinner").hide();
        })
        .fail(function(xhr, status, error) {
            console.log("Error getMap: " + error + " status: " + status);
            $("#spinner").hide();
            $("#dialog-text").text("Request error");
            $("#dialog").show();
        });
}

/**
 * Asyncronously save countries detais from map on cache 
 * @param mapid 
 */
function saveCountriesCache(mapid) {
    setTimeout(function() {
        $.get("/save/" + mapid)
            .done((function(data) {
                var json = JSON.parse(data);
                if (json["status"] && json["status" == 0]) {
                    return;
                }
            }).bind(this))
            .fail(function(xhr, status, error) {
                console.log("Error saveCountries: " + error + " status: " + status);
                $("#spinner").hide();
                $("#dialog-text").text("Request error");
                $("#dialog").show();
            });
    }, 3000);
}


/**
 * Asyncronously save countries detais from map on static files 
 * @param mapid 
 */
function saveCountriesStatic(mapid) {
    setTimeout(function() {
        $.get("/static/" + mapid)
            .done((function(data) {
                var json = JSON.parse(data);
                if (json["status"] && json["status" == 0]) {
                    return;
                }
            }).bind(this))
            .fail(function(xhr, status, error) {
                console.log("Error saveCountries: " + error + " status: " + status);
                $("#spinner").hide();
                $("#dialog-text").text("Request error");
                $("#dialog").show();
            });
    }, 3000);
}

/**
 * Load chart from data
 * @param mapid 
 * @param data 
 */
function reloadChart(mapid, data) {
    $("#spinner").hide();
    $("#dialog").hide();
    var error = false;
    try {
        var json = JSON.parse(data);
    } catch (e) {
        var json = data;
    }
    var message;
    if (!json) {
        error = true;
        message = "Undefined error";
    } else if (json["timeSeries"] && json["timeSeries"]) {
        this.showCharts(mapid, json["timeSeries"]);
    } else if (json["elevation"] && json["elevation"]) {
        $("#show-all-countries").show();
        this.showGeoChart(this.title, json["elevation"]);
    } else if (json["histogram"] && json["histogram"]) {
        this.showHistogram(this.title, json["histogram"]);
    } else if (json["forestChange"] && json["forestChange"]) {
        this.showPieChart(this.title, json["forestChange"]);
    } else if (json["error"]) {
        error = true;
        message = json["error"];
    } else {
        error = true;
        message = "Sorry, there is no data available";
    }
    if (!error) {
        $("#panel").fadeIn(500);
        $("#panel-title").show().text(this.title);
        if (this.title !== "Custom") {
            $("#panel-wiki").show();
        } else {
            $("#panel-wiki").hide();
        }
    } else {
        $("#panel-wiki").hide();
        $("#dialog-text").text(message);
        $("#dialog").show();
    }
}

/**
 * Show charts of mapid and with timeSeries
 * @param mapid 
 * @param timeSeries 
 */
function showCharts(mapid, timeSeries) {
    for (var i = 0; i < timeSeries.length; i++) {
        var value = timeSeries[i];
        if (value != null) {
            if (i + 1 < timeSeries.length) {
                var nextValue = timeSeries[i + 1];
                if (nextValue != null && value[0] == nextValue[0]) {
                    timeSeries.splice(i + 1, 1);
                    value[1] = (value[1] + nextValue[1]) / 2;
                }
            }
            value[0] = new Date(parseInt(value[0], 10));
        }
    }
    this.data = new google.visualization.DataTable();
    this.data.addColumn("date");
    this.data.addColumn("number");
    this.data.addRows(timeSeries);

    if (mapid == '0') {
        this.options = { title: "High", hAxis: "Date", vAxis: "Elevation" }
    } else if (mapid == '1') {
        this.options = { title: "Lights", hAxis: "Date", vAxis: "Luminosity" }
    } else if (mapid == '2') {
        this.options = { title: "Temperature", hAxis: "Date", vAxis: "Celsius Degrees" }
    } else if (mapid == '3') {
        this.options = { title: "Water Occurrence Change Intensity", hAxis: "Date", vAxis: "Water" }
    } else if (mapid == '4') {
        this.options = { title: "Water Change", hAxis: "Date", vAxis: "Water", legend: "0: 'No observations', 1: 'Not water', 2: 'Seasonal water', 3: 'Permanent water'" }
    } else if (mapid == '5') {
        this.options = { title: "Forest Change", hAxis: "Date", vAxis: "Pixels representing loss" }
    } else if (mapid == '6') {
        this.options = { title: "Vegetation Index", hAxis: "Date", vAxis: "NDVI" }
    }

    this.columnNames = [this.options.hAxis, this.options.vAxis];
    if (mapid != 1 && mapid != 4) {
        this.showLineChart(this.options, this.data);
    } else {
        this.showBarChart(this.options, this.data);
    }
}

/**
 * Show chart of all countries (currently it allows mapid = 0 w/ geochart)
 * @param mapid 
 * @param data 
 */
function showAllCharts(mapid, data) {
    $("#panel-title").text("All countries");
    if (mapid == '0') {
        this.columnNames = ["Country", "Elevation"];
    }
    elems = [this.columnNames];
    if (Array.isArray(data)) {
        data.forEach(function(e) {
            if (e != null && e != undefined) {
                var elem = [];
                elem[0] = e["name"];
                var dElem = JSON.parse(e["data"]);
                if (mapid == '0') {
                    elem[1] = dElem["elevation"];
                }
                if (elem[1] != null) {
                    elems.push(elem);
                }
            }
        });
        if (mapid == '0') {
            this.showAllGeoChart(elems);
        }
    } else if (this.countries) {
        var n = this.countries.length;
        var c = 0;
        this.countries.forEach(function(country_id) {
            $.get("/country/" + country_id)
                .done((function(country_name) {
                    c++;
                    try {
                        var e = data[country_id];
                        if (e != null && e != undefined) {
                            var elem = [];
                            elem[0] = country_name;
                            if (mapid == '0') {
                                elem[1] = e["elevation"];
                            }
                            if (elem[1] != null) {
                                elems.push(elem);
                            }

                            if (mapid == '0') {
                                this.showAllGeoChart(elems);
                            }
                        }
                    } catch (e) {

                    }
                    if (c == n) {
                        $("#spinner").hide();
                    }
                }).bind(this))
                .fail(function(xhr, status, error) {
                    c++;
                    if (c == n) {
                        $("#spinner").hide();
                    }
                    console.log("Error getCountryName: " + error + " status: " + status);
                    $("#dialog-text").text("Request error");
                    $("#dialog").show();
                });
        });
    }
}

/**
 * Show geochart map with country and elevation
 * @param country 
 * @param elevation 
 */
function showGeoChart(country, elevation) {
    this.type = "GeoChart";
    this.getScreenDimensions();
    this.columnNames = ["Country", "Elevation"];
    this.data = google.visualization.arrayToDataTable([
        this.columnNames, [country, elevation]
    ]);
    this.options = { title: "Elevation Average", width: this.width, height: this.height, colorAxis: { colors: ["blue"] } }
    this.chart = new google.visualization.GeoChart(document.getElementById("panel-chart-geo"));
    this.chart.draw(this.data, this.options);
    $("#panel-wide").css("width", this.width);
    $("#button-panel-line").hide();
    $("#button-panel-bar").hide();
    $("#panel-chart-geo").show();
    this.prepareChartLink();
}

/**
 * Show Geochart of all countries
 * @param countries 
 */
function showAllGeoChart(countries) {
    this.type = "GeoChart";
    this.getScreenDimensions();
    this.data = google.visualization.arrayToDataTable(countries);
    this.options = { title: "Elevation Average", width: this.width, height: this.height, colorAxis: { colors: ["white", "blue", "black"] } }
    this.chart = new google.visualization.GeoChart(document.getElementById("panel-chart-geo"));
    this.chart.draw(this.data, this.options);
    this.zoom = true;
    $("#panel-wide").css("width", this.width);
    $("#button-panel-line").hide();
    $("#button-panel-bar").hide();
    $("#panel-chart-geo").show();
    $("#show-all-countries").hide();
    this.prepareChartLink();
}

/**
 * Creates Line Chart with the data
 * @param opts 
 * @param data 
 * @param width 
 * @param height 
 */
function showLineChart(opts, data, width, height) {
    this.type = "LineChart";
    if (!width || !height) {
        this.getScreenDimensions();
        width = this.width;
        height = this.height;
    }
    $("#panel-wide").css("width", width);
    var title = opts["title"];
    if (opts["legend"]) {
        title = title + " - " + opts["legend"];
    }
    this.chart = new google.visualization.ChartWrapper({
        chartType: "LineChart",
        dataTable: data,
        options: {
            title: title,
            curveType: "function",
            legend: { position: "none" },
            titletextStyle: { fontName: "Roboto" },
            width: width,
            height: height,
            hAxis: {
                title: opts["hAxis"]
            },
            vAxis: {
                title: opts["vAxis"]
            }
        }
    });
    $("#panel-chart-line").show();
    $("#panel-chart-bar").hide();
    $("#button-panel-line").hide();
    $("#button-panel-bar").show();
    var chartEl = $("#panel-chart-line").get(0);
    this.chart.setContainerId(chartEl);
    this.chart.draw();
    this.prepareChartLink(true);
}

/**
 * Creates Bar Chart with the data
 * @param opts 
 * @param data 
 * @param width 
 * @param height 
 */
function showBarChart(opts, data, width, height) {
    this.type = "BarChart";
    if (!width || !height) {
        this.getScreenDimensions();
        width = this.width;
        height = this.height;
    }
    $("#panel-wide").css("width", width);
    var title = opts["title"];
    if (opts["legend"]) {
        title = title + " - " + opts["legend"];
    }
    this.chart = new google.visualization.ChartWrapper({
        chartType: "ColumnChart",
        dataTable: data,
        options: {
            title: title,
            legend: { position: "none" },
            titleTextStyle: { fontName: "Roboto" },
            width: width,
            height: height,
            hAxis: {
                title: opts["hAxis"]
            },
            vAxis: {
                title: opts["vAxis"]
            }
        }
    });
    $("#panel-chart-line").hide();
    $("#panel-chart-bar").show();
    $("#button-panel-line").show();
    $("#button-panel-bar").hide();
    var chartEl = $("#panel-chart-bar").get(0);
    this.chart.setContainerId(chartEl);
    this.chart.draw();
    this.prepareChartLink(true);
}

/**
 * Creates histogran of a country
 * @param country 
 * @param elems 
 */
function showHistogram(country, elems) {
    this.type = "Histogram";
    this.getScreenDimensions();
    this.columnNames = ["Country", "Water Occurence"];
    var arrElems = [this.columnNames];
    elems.forEach(function(e) {
        var elem = [];
        elem[0] = country;
        elem[1] = e;
        arrElems.push(elem);
    });
    this.data = google.visualization.arrayToDataTable(arrElems);
    this.options = {
        title: "Water Occurrence Change Intensity",
        width: this.width,
        height: this.height,
        colorAxis: { colors: ["blue"] },
        legend: { position: "none" }
    };
    this.chart = new google.visualization.Histogram(document.getElementById("panel-chart-histogram"));
    this.chart.draw(this.data, this.options);
    $("#panel-wide").css("width", this.width);
    $("#button-panel-line").hide();
    $("#button-panel-bar").hide();
    $("#panel-chart-histogram").show();
    this.prepareChartLink();
}

/**
 * Show geochart map with country and elevation
 * @param country 
 * @param forestChange 
 */
function showPieChart(country, forestChange) {
    this.type = "PieChart";
    this.getScreenDimensions();
    this.columnNames = ["Status", "Percentage"];
    if (!forestChange[1] &&  !forestChange[2]) {
        $("#dialog-text").text("There is not enough forest data to create a chart");
        $("#dialog").show();
    }
    this.data = google.visualization.arrayToDataTable([
        this.columnNames, ["Gain", forestChange[1] * 100],
        ["Loss", forestChange[2] * 100]
    ]);
    this.options = {
        title: "Forest change - Total forest in area: " + ((forestChange[0] / 255) * 100).toFixed(3) + "%",
        width: this.width,
        height: this.height,
        pieSliceText: "none"
    }
    if (this.width > this.height) {
        this.options["legend"] = { position: 'labeled' };
    }
    this.chart = new google.visualization.PieChart(document.getElementById("panel-chart-pie"));
    this.chart.draw(this.data, this.options);
    $("#panel-wide").css("width", this.width);
    $("#button-panel-line").hide();
    $("#button-panel-bar").hide();
    $("#panel-chart-pie").show();
    this.prepareChartLink();
}

/**
 * Get screen dimensions and sets width and height
 */
function getScreenDimensions() {
    var maxWidth = $(window).width();
    var maxHeight = $(window).height();
    if (maxWidth > 800) {
        if (!this.zoom) {
            this.width = 800;
            this.height = 350;
        } else {
            this.width = 1000;
            this.height = 500;
        }
    } else {
        this.height = maxHeight - 90;
        this.width = maxWidth;
    }
}

// Map titles
var MapTitle = [
    "Elevation",
    "Lights",
    "Temperature",
    "Water Occurrence",
    "Water Change",
    "Forest Change",
    "Vegetation"
]

// Info from all maps
var MapInfo = [
    "The SRTM elevation map uses a scale from 0 to 3000 using a spectrum palette of blue, green and red, where blue indicates less height and red the most",
    "NOAA Lights map give us a representation of the brightness of each country",
    "The MODIS Land	Surface	Temperature	map	runs on	a scale	of 0 to	40°C, where	blue indicates colder values and red indicates warmer values. White	indicates values in	the middle of the spectrum, around 20°C",
    "Water Occurrence provides a summary of where and how often surface water occurred over time, using red as minimum and blue as maximum",
    "The Water Change map shows the places that water has reduced in red and in green where it has grown",
    "The Forest Change map represents forest change, is green where there's forest, red where there's forest loss, blue where there's forest gain, and magenta where there's both gain and loss.",
    "The MODIS Normalized Difference Vegetation Index (NDVI) map runs on a scale of 0 to 1, where white and brown indicate no to low vegetation, and green to black indicate medium to high vegetation."
]

/**
 * Shows map info for current map
 * @param mapid 
 */
function showMapInfo(mapid) {
    $("#map-title").text(MapTitle[mapid]);
    $("#map-info span").text(MapInfo[mapid]);
    $("#map-info").show();
}

/**
 * Prepares link to download chart image
 * @param wrapper 
 */
function prepareChartLink(wrapper) {
    setTimeout(function() {
        if (wrapper) {
            try {
                this.chart = this.chart.getChart();
            } catch (e) {}
        }
        if (this.chart != null) {
            try {
                var url = this.chart.getImageURI();
                $("#open-chart").attr("href", url);
                var title = this.options.title + " in " + $("#panel-title").text() + " Chart Image.png";
                $("#open-chart").attr("download", title);
            } catch (e) {

            }
        }
    }, 1000);
}

/**
 * Generates CSV from current data
 */
function dataTableToCSV() {
    var dt_cols = this.data.getNumberOfColumns();
    var dt_rows = this.data.getNumberOfRows();
    var csv_cols = [];
    var csv_out;
    // Iterate columns
    for (var i = 0; i < dt_cols; i++) {
        // Replace any commas in column labels
        csv_cols.push(this.columnNames[i].replace(/;/g, ""));
    }
    csv_out = csv_cols.join(";") + "\r\n";
    // Iterate rows
    for (i = 0; i < dt_rows; i++) {
        var raw_col = [];
        for (var j = 0; j < dt_cols; j++) {
            // Replace any commas in row values
            raw_col.push(this.data.getFormattedValue(i, j).replace(/;/g, ""));
        }
        // Add row to CSV text
        csv_out += raw_col.join(";") + "\r\n";
    }
    return csv_out;
}

/**
 * Downloads CSV created
 * @param csv_out 
 * @param title 
 */
function downloadCSV(csv_out, title) {
    var blob = new Blob([csv_out], { type: "text/csv;charset=utf-8" });
    var url = window.URL || window.webkitURL;
    var link = document.createElement("a");
    link.href = url.createObjectURL(blob);
    link.download = title + ".csv";
    document.body.appendChild(link);
    link.click();
}

/**
 * Allows to draw a polygon with specific color
 * @param color 
 */
function polygonDraw(color) {
    var that = this;
    $("#menu-draw-color").children("i").css("color", color);
    // Create a Google Maps Drawing Manager for drawing polygons.
    this.drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: false,
        polygonOptions: {
            fillColor: color,
            strokeColor: color
        }
    });

    // Respond when a new polygon is drawn.
    google.maps.event.addListener(this.drawingManager, "overlaycomplete",
        function(event) {
            that.polygon = event.overlay;
            that.stopDrawing();
            that.saveStorage();
        });

    this.drawingManager.setMap(this.map);
}

function stopDrawing() {
    this.drawingManager.setOptions({ drawingMode: null });
    this.drawingManager.setMap(null);
}

function saveStorage() {
    sessionStorage.setItem("zoom", JSON.stringify(this.map.getZoom()));
    var lat = this.map.getCenter().lat();
    var lng = this.map.getCenter().lng();
    sessionStorage.setItem("lat", lat);
    sessionStorage.setItem("lng", lng);
}

function clearStorage() {
    sessionStorage.removeItem("zoom");
    sessionStorage.removeItem("lat");
    sessionStorage.removeItem("lng");
    sessionStorage.removeItem("data");
    localStorage.removeItem("map_data");
}

/**
 * Restart to draw a polygon with specific color
 * @param color 
 */
function allowDrawing(changeColor) {
    if (!this.color || changeColor) {
        this.color = this.findRandomColor();
    }
    $("#menu-draw-color").children("i").css("color", this.color);
    if (this.polygon) {
        this.polygon.setOptions({
            fillColor: this.color,
            strokeColor: this.color
        });
        this.stopDrawing();
    } else {
        this.polygonDraw(this.color);
    }
}

/**
 * Get coordinates of a polygon
 * @param polygon 
 */
function getCoordinates(polygon) {
    var points = polygon.getPath().getArray();
    return points.map(function(point) {
        return [point.lng(), point.lat()];
    });
}

/**
 * Remove polygon from map
 */
function removePolygon() {
    if (this.polygon) {
        this.polygon.setMap(null);
        this.polygon = null;
    }
}

/**
 * Send polygon to find details about it
 */
function sendPolygon() {
    var that = this;
    if (this.polygon) {
        var coordinates = getCoordinates(polygon);
        var geojson = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "id": "EXA",
                "properties": { "name": "Custom" },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coordinates]
                }
            }]
        };
        var feature = JSON.stringify(geojson);
        $("#spinner").show();
        that.title = "Custom";
        var mapid = $("#input-save-map").val();
        var zoom = that.map.getZoom();
        $.post("/custom/" + mapid + "/" + zoom, feature)
            .done((function(data) {
                var json = JSON.parse(data);
                sessionStorage.setItem("data", JSON.stringify(json));
                that.reloadChart(mapid, data);
            }).bind(this))
            .fail(function(xhr, status, error) {
                console.log("Error sendPolygon: " + error + " status: " + status);
                $("#spinner").hide();
                $("#dialog-text").text("Request error");
                $("#dialog").show();
            });
    } else {
        $("#dialog-text").text("You must create a polygon first");
        $("#dialog").show();
    }
}

/**
 * Zoom the chart
 */
function zoomChart(that) {
    if (!that.zoom) {
        var width = 1000;
        var height = 500;
        that.zoom = true;
    } else {
        var width = 800;
        var height = 350;
        that.zoom = false;
    }
    if (that.type == "GeoChart") {
        that.chart = new google.visualization.GeoChart(document.getElementById("panel-chart-geo"));
        that.options.width = width;
        that.options.height = height;
        that.chart.draw(that.data, that.options);
        that.prepareChartLink();
    } else if (this.type == "LineChart") {
        if (width == 1000) {
            width = width + 200;
        }
        that.showLineChart(that.options, that.data, width, height);
    } else if (that.type == "BarChart") {
        if (width == 1000) {
            width = width + 200;
        }
        that.showBarChart(that.options, that.data, width, height);
    } else if (that.type == "Histogram") {
        that.chart = new google.visualization.Histogram(document.getElementById("panel-chart-histogram"));
        that.options.width = width;
        that.options.height = height;
        that.chart.draw(that.data, that.options);
        that.prepareChartLink();
    } else if (that.type = "PieChart") {
        that.chart = new google.visualization.PieChart(document.getElementById("panel-chart-pie"));
        that.options.width = width;
        that.options.height = height;
        that.chart.draw(that.data, that.options);
        that.prepareChartLink();
    }
    $("#panel-wide").css("width", width);
}
/**
 * Create searchbox for the map
 * @param map 
 */
function initSearchPlaces(map) {
    var that = this;
    // Create the search box and link it to the UI element.
    var input = document.getElementById("search-input");
    var searchBox = new google.maps.places.SearchBox(input);
    map.controls.push(input);
    var infowindow = new google.maps.InfoWindow();
    var geocoder = new google.maps.Geocoder;
    var marker = new google.maps.Marker({
        map: map
    });
    // Bias the SearchBox results towards current map's viewport.
    map.addListener("bounds_changed", function() {
        searchBox.setBounds(map.getBounds());
    });

    if (this.markers) {
        this.markers.forEach(function(marker) {
            marker.setMap(null);
        });
    }
    this.markers = [];
    // Listen for the event fired when the user selects a prediction and retrieve
    // more details for that place.
    searchBox.addListener("places_changed", function() {
        infowindow.close();
        var places = searchBox.getPlaces();

        if (places.length == 0) {
            return;
        }

        // Clear out the old markers.
        that.markers.forEach(function(marker) {
            marker.setMap(null);
        });
        that.markers = [];

        // For each place, get the icon, name and location.
        var bounds = new google.maps.LatLngBounds();
        places.forEach(function(place) {
            if (!place.geometry) {
                console.log("Returned place contains no geometry");
                return;
            }
            if (place.place_id) {
                geocoder.geocode({ "placeId": place.place_id }, function(results, status) {
                    if (status !== "OK") {
                        window.alert("Geocoder failed due to: " + status);
                        return;
                    }
                    // Set the position of the marker using the place ID and location.
                    marker.setPlace({
                        placeId: place.place_id,
                        location: results[0].geometry.location
                    });
                    marker.setVisible(true);
                    document.getElementById("place-name").textContent = place.name;
                    document.getElementById("place-id").textContent = place.place_id;
                    document.getElementById("place-address").textContent =
                        results[0].formatted_address;
                    infowindow.setContent(document.getElementById("place-content"));
                    infowindow.open(map, marker);
                });
            }
            var icon = {
                url: place.icon,
                size: new google.maps.Size(71, 71),
                origin: new google.maps.Point(0, 0),
                anchor: new google.maps.Point(17, 34),
                scaledSize: new google.maps.Size(25, 25)
            };

            if (marker) {
                that.markers.push(marker);
            } else {
                that.markers.push(new google.maps.Marker({
                    map: map,
                    icon: icon,
                    title: place.name,
                    position: place.geometry.location
                }));
            }

            if (place.geometry.viewport) {
                // Only geocodes have viewport.
                bounds.union(place.geometry.viewport);
            } else {
                bounds.extend(place.geometry.location);
            }
        });
        map.fitBounds(bounds);
        map.setZoom(14);
        $("#search-button").removeClass("search-button-show");
        $("#search-input").hide();
        $("#map-info").hide();
    });
}

/**
 * Attach listener when button about is clicked
 */
function handleAbout() {
    var snackbarContainer = document.querySelector("#snackbar-about");
    var showSnackbarButton = document.querySelector("#button-about");
    showSnackbarButton.addEventListener("click", function() {
        var data = {
            message: "Made by Mónica Pastor",
            timeout: 4000
        };
        snackbarContainer.MaterialSnackbar.showSnackbar(data);
    });
}

/**
 * Attach all listeners and interactivity
 */
function attachListeners() {
    var that = this;
    that.zoom = false;

    $(".change_map").click(function() {
        var id = $(this).attr("map_id");
        that.getMap(id);
        $("#panel").hide();
        $("#input-save-map").val(id);
        $("#switch-draw").attr("cheched", false);
    });

    var dialog = document.querySelector("dialog");
    if (!dialog.showModal) {
        dialogPolyfill.registerDialog(dialog);
    }
    $("#dialog-close").click(function() {
        $("#dialog").hide()
    });

    $("#panel-close").click(function() {
        $("#panel").hide();
    });
    $("#panel-download").click(function() {
        var csv = that.dataTableToCSV();
        var title = that.options.title + " in " + $("#panel-title").text();
        that.downloadCSV(csv, title);
    });

    $("#button-zoom-map").click(function() {
        that.zoomChart(that);
    });

    $("#button-panel-line").click(function() {
        that.zoom = false;
        $("#button-panel-line").hide();
        $("#panel-chart-bar").hide();
        $("#button-panel-bar").show();
        that.showLineChart(that.options, that.data);
        $("#panel-chart-line").show();
    });

    $("#button-panel-bar").click(function() {
        that.zoom = false;
        $("#button-panel-bar").hide();
        $("#panel-chart-line").hide();
        $("#button-panel-line").show();
        that.showBarChart(that.options, that.data);
        $("#panel-chart-bar").show();
    });

    $("#close-map-info").click(function() {
        $(this).parent().hide();
        $("#info-button").show();
        $("#info-label").show();
    });

    $("#show-all-countries").click(function() {
        var mapid = $("#input-save-map").val();
        that.getAllDetails(mapid);
    });

    $("#switch-draw").change(function() {
        if ($(this).is(":checked")) {
            that.drawing = true;
            $(this).attr("checked", false);
            $("#menu-draw").show();
            $("#panel").hide();
            that.color = "#ff0000";
            that.polygonDraw(that.color);
            that.removeCountries();
        } else {
            that.drawing = false;
            $(this).attr("checked", true);
            $("#menu-draw").hide();
            that.removePolygon();
            that.stopDrawing();
            that.addCountries(that.countries);
            that.clearStorage();
        }
    });

    $("#menu-draw-clear").click(function() {
        that.removePolygon();
        var polygonOptions = null;
        that.allowDrawing();
    });

    $("#menu-draw-done").click(function() {
        that.sendPolygon();
    });

    $("#show-menu-draw").click(function() {
        $("#menu-draw").show();
    });

    $("#menu-draw-color").click(function() {
        that.allowDrawing(true);
    });

    $("#menu-draw-close").click(function() {
        $("#menu-draw").hide();
        $("#button-draw").show();
        $("#draw-label").show();
    });

    $("#button-draw").click(function() {
        $(this).hide();
        $("#menu-draw").show();
        $("#draw-label").hide();
    });

    $("#search-button").click(function() {
        $("#panel").hide();
        if ($(this).hasClass("search-button-show")) {
            $(this).removeClass("search-button-show");
            $("#search-input").hide();
            if (that.markers) {
                that.markers.forEach(function(marker) {
                    marker.setMap(null);
                });
            }
        } else {
            $(this).addClass("search-button-show");
            $("#search-input").show();
            $("#search-input").focus();
            if (that.map) {
                that.initSearchPlaces(that.map);
            }
        }
    });

    $("#info-button").click(function() {
        $("#map-info").show();
        $(this).hide();
        $("#info-label").hide();
    });

    $("#google-button-clear").click(function() {
        $("#map-info").hide();
        $(this).hide();
        $("#google-button-show").show();
        $("#info-label-clear").hide();
        $("#info-label-show").show();
        that.mapPrev = that.map.overlayMapTypes.pop();
    });

    $("#google-button-show").click(function() {
        $("#map-info").show();
        $(this).hide();
        $("#google-button-clear").show();
        $("#info-label-show").hide();
        $("#info-label-clear").show();
        if (that.mapPrev) {
            that.map.overlayMapTypes.push(that.mapPrev);
        }
    });
}

function removeListeners() {
    $(".change_map").off();
    $("#dialog-close").off();
    $("#panel-close").off();
    $("#panel-download").off();
    $("#button-zoom-map").off();
    $("#button-panel-line").off();
    $("#button-panel-bar").off();
    $("#close-map-info").off();
    $("#show-all-countries").off();
    $("#switch-draw").off();
    $("#menu-draw-clear").off();
    $("#menu-draw-done").off();
    $("#show-menu-draw").off();
    $("#menu-draw-color").off();
    $("#menu-draw-close").off();
    $("#button-draw").off();
    $("#search-button").off();
    $("#info-button").off();
    $("#google-button-clear").off();
    $("#google-button-show").off();
}

//Execute when page is ready
$(function() {
    if (($(document).width() > 1000) || ($(document).height() > 1000)) {
        $("#panel").draggable();
        $("#menu-draw").draggable();
        $("#map-info").draggable();
    }
    //useGeolocalization(map);
    $(window).on("orientationchange", function(e) {
        if (($(document).width() < 800) && $("#panel").is(":visible")) {
            var mapid = $("#input-save-map").val();
            var data = sessionStorage.getItem("data");
            this.reloadChart(mapid, data);
        }
    });
});