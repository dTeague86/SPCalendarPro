/*
 * @name SPCalendarPro
 * Version 1.3.2
 * No dependencies!
 * @description An ultra lightweight JavaScript library to easily manage SharePoint calendar events.
 * @documentation https://sharepointhacks.com/sp-calendar-pro
 * @author Sam Perrow sam.perrow399@gmail.com
 *
 * Copyright 2018 Sam Perrow (email : sam.perrow399@gmail.com)
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/mit-license.php
*/

(function(global, factory) {
    global.spcalpro = factory();
}(this, function() {
    "use strict";

    function getUserEnvInfo(site) {
        var spVersion = _spPageContextInfo.webUIVersion;
        var soapEndpoint = "/_vti_bin/Lists.asmx";

        return (typeof site === 'string' && site.length > 0)
            ? site + soapEndpoint 
            : (spVersion === 15) ? _spPageContextInfo.webAbsoluteUrl + soapEndpoint : document.location.protocol + '//' + document.location.host + _spPageContextInfo.webServerRelativeUrl + soapEndpoint;
    }

    // checks if supplied datetimes are the same date as ones in calendar list.
    SPCalendarPro.prototype.isSameDate = function(reqbeginDate, reqEndDate) {
        return this.data.filter(function(event) {
            return event.EventDate.split(" ")[0] === reqbeginDate && event.EndDate.split(" ")[0] === reqEndDate;
        });
    }

    // provide begin/end datetimes, and this method will check for events that fall in that range..
    SPCalendarPro.prototype.matchDateTimes = function(reqBeginDT, reqEndDT) {
        return this.data.filter(function(event) {
            return (event.EventDate <= reqBeginDT) && (event.EndDate >= reqEndDT);
        });
    }

    // checks for time conflicts between provided begin/end datetime and events
    SPCalendarPro.prototype.isTimeConflict = function(reqBeginDT, reqEndDT) {

        return this.data.filter(function(event) {
            var arrBeginDT = event.EventDate;
            var arrEndDT = event.EndDate;

            return (reqBeginDT <= arrBeginDT && reqEndDT >= arrEndDT) || (arrBeginDT < reqBeginDT && arrEndDT > reqBeginDT)
                || (arrBeginDT < reqEndDT && arrEndDT > reqEndDT) || (reqBeginDT < arrBeginDT && reqEndDT > arrEndDT);
        });
    }

    // to be used internally, only for formatted the provided datetimes into other formats.
    function formatDateTimesToObj(beginDT, endDT) {
        return {
            begin: {
                beginDateTime: beginDT,
                beginDate: beginDT.split(" ")[0],
                beginTime: beginDT.split(" ")[1]
            },
            end: {
                endDateTime: endDT,
                endDate: endDT.split(" ")[0],
                endTime: endDT.split(" ")[1]
            }
        };
    }

    // Converts large string from external list to valid XML
    function StringToXML(oString) {
        return (window.ActiveXObject) 
            ? new ActiveXObject("Microsoft.XMLDOM").loadXML(oString) 
            : new DOMParser().parseFromString(oString, 'application/xml');
    }

    // Create the CAML query. returns single and recurring events by default, unless otherwise specified.
    var CamlBuilder = function(userObj, listType) {
        var soapHeader = '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetListItems xmlns="http://schemas.microsoft.com/sharepoint/soap/"><listName>' + userObj.listName + '</listName>';
        var soapFooter = '</GetListItems></soap:Body></soap:Envelope>';
        var beginRecurringCaml = '<Where><DateRangesOverlap><FieldRef Name="EventDate"/><FieldRef Name="EndDate"/><FieldRef Name="RecurrenceID"/><Value Type="DateTime"><Year/></Value></DateRangesOverlap></Where>';
        var endRecurringCaml = '<OrderBy><FieldRef Name="EventDate"/></OrderBy></Query></query><queryOptions><QueryOptions><RecurrencePatternXMLVersion>v3</RecurrencePatternXMLVersion><ExpandRecurrence>TRUE</ExpandRecurrence><RecurrenceOrderBy>TRUE</RecurrenceOrderBy><ViewAttributes Scope="RecursiveAll"/></QueryOptions></queryOptions>';

        function createQuery() {
            var query = "<query><Query>";
            var endQuery = "</Query></query>";

            if (userObj.camlQuery) query = userObj.camlQuery;

            if (userObj.fields) endQuery += getFieldNames();

            if (userObj.where) query += whereParser( userObj.where );

            if (listType === 'list') {
                query += endQuery;
            } else if (listType === 'calendar') {
                query += beginRecurringCaml + endRecurringCaml;             // returns single and recurring events
            } 

            return soapHeader + query + soapFooter;
        }

        function getFieldNames() {
            var viewFields = (listType === 'calendar') ? '<FieldRef Name="fRecurrence"/>' : '';
            for (var i = 0; i < userObj.fields.length; i++) {
                if (typeof userObj.fields[i] === "string") {
                    viewFields += '<FieldRef Name="' + userObj.fields[i] + '"/>';
                }
            }
            return (viewFields.length > 0) ? "<viewFields><ViewFields>" + viewFields + "</ViewFields></viewFields>" : '';
        }

        function whereParser(str) {
            var fieldName = str.split(' ')[0];
            var operation = str.split(' ')[1];
            var value = str.split(operation + ' ')[1];
            var fieldCaml = '<FieldRef Name="' + fieldName + '"/>';
            var camlValue = '<Value Type="Text">' + value + '</Value>';

            var operators = {
                '=':  "Eq",
                '>':  "Gt",
                '<':  "Lt",
                '>=': "Geq",
                '<=': "Leq",
                '!=': "Neq"
            }
            return "<Where><" + operators[operation] + ">" + fieldCaml + camlValue + "</" + operators[operation] + "></Where>";
        }

        return createQuery();
    }


    // Query the calendar or list and return the items
    var getListData = function(spCalProObj, userObj) {
        postAjax(spCalProObj.CamlQuery);

        // make ajax request. fires synchronously by default.
        function postAjax(soapStr) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', spCalProObj.userEnvData, spCalProObj.async);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.setRequestHeader('Content-Type', 'text/xml;charset="utf-8"');
            xhr.send(soapStr);
            if (spCalProObj.async === true) {
                xhr[(xhr.onload) ? "onload" : "onreadystatechange"] = function() {
                    return determineXhrStatus(xhr);
                }
            } 
            else {
                determineXhrStatus(xhr);
            }
        }

        function determineXhrStatus(xhr) {
            if (xhr.readyState == 4 && xhr.status == 200) {
                XhrToObj(xhr);
                complete();
            } else if (xhr.status == 500) {
                getErrorData(xhr);
                complete();
            }
        }

        function XhrToObj(xhr) {
            if (xhr.responseXML) {
                return spCalProObj.data = XmlToJson(xhr.responseXML.getElementsByTagName("*"));
            } else if (!xhr.responseXML && xhr.responseText) {                                  // in case the list is an external list.
                var xml = StringToXML(xhr.responseText.replace(/&#22;|&#0;/g, ""));             // removes HTML chars that makes the XML parsing fail.
                return spCalProObj.data = XmlToJson(xml.getElementsByTagName("*"));
            }
        }

        function getErrorData(xhr) {
            return spCalProObj.error = {
                errorCode: (/<errorcode xmlns="http:\/\/schemas.microsoft.com\/sharepoint\/soap\/">/.test(xhr.responseText)) ? xhr.responseText.split('<errorcode xmlns="http://schemas.microsoft.com/sharepoint/soap/">')[1].split('</errorcode>')[0] : '',
                errorString: (/<errorstring xmlns="http:\/\/schemas.microsoft.com\/sharepoint\/soap\/">/.test(xhr.responseText)) ? xhr.responseText.split('<errorstring xmlns="http://schemas.microsoft.com/sharepoint/soap/">')[1].split('</errorstring>')[0] : '',
                faultString: (/<faultstring>/.test(xhr.responseText)) ? xhr.responseText.split('<faultstring>')[1].split('</faultstring>')[0] : ''
            }
        }

        // accepts XML, returns an array of objects, each of which are calendar events.
        function XmlToJson(xml) {
            var eventArr = [];
            for (var i = 0; i < xml.length; i++) {
                var row = {};
                var rowAttrs = xml[i].attributes;
                if (xml[i].nodeName === 'z:row') {
                    for (var j = 0; j < rowAttrs.length; j++) {
                        var attrName = rowAttrs[j].name.split("ows_")[1];
                        row[attrName] = rowAttrs[j].value;
                    }
                    eventArr.push(row);
                }
            }
            return eventArr;
        }

        function complete() {
            return (userObj.callback) ? userObj.callback(spCalProObj.data, spCalProObj) : (spCalProObj.userCallback) ? spCalProObj.userCallback(spCalProObj.data, spCalProObj) : spCalProObj;
        }

        return spCalProObj.data;
    }

    String.prototype.formatInputToHours = function() {
        var amPmTime = this.split(" ");
        var hours = Number(amPmTime[0]);
        return (amPmTime[1] === 'PM' && hours < 12) ? hours += 12 : (hours < 10) ? "0" + hours.toString() : hours;
    }

    // this will grab date/time input values from a sharepoint form and convert them into proper date objects for later use. by default this grabs the first and second date/time rows from a form.
    var convertFormDateTimes = function(row1, row2) {
        row1 = (!row1) ? 0 : row1;
        row2 = (!row2) ? 1 : row2;

        function findDateTimes(row) {
            var dtParentElem = document.querySelectorAll('input[id$="DateTimeField_DateTimeFieldDate"]')[row].parentNode.parentNode;
            var timeElem = dtParentElem.getElementsByClassName('ms-dttimeinput')[0];
            if (timeElem) {
                var hours = timeElem.getElementsByTagName('select')[0].value;
                var min = timeElem.getElementsByTagName('select')[1].value;
            }

            // This adds a "0" in front of a single digit month, so that browsers interpret better.
            var splitDate = dtParentElem.getElementsByTagName('td')[0].getElementsByTagName('input')[0].value.split("/").map(function(item) {
                return (item.length === 1) ? "0" + item : item;
            });

            var formattedDate = splitDate[2] + "-" + splitDate[0] + "-" + splitDate[1];

            return {
                date: formattedDate,
                time: function() {
                    return (hours && min) ? hours.formatInputToHours() + ':' + min + ":00" : '';
                }
            }
        }
        var beginDateTimes = findDateTimes(row1);
        var endDateTimes = findDateTimes(row2);

        return {
            userBeginDT: beginDateTimes.date + ' ' + beginDateTimes.time(),
            userEndDT: endDateTimes.date + ' ' + endDateTimes.time()
        }
    }

    // taken from https://stackoverflow.com/questions/7153470/why-wont-filter-work-in-internet-explorer-8
    function createArrayFilter() {
        return Array.prototype.filter = function(fn) {
            if (this === void 0 || this === null)
                throw new TypeError();
            var t = Object(this);
            var len = t.length >>> 0;
            if (typeof fn !== "function")
                throw new TypeError();
            var res = [];
            var thisp = arguments[1];
            for (var i = 0; i < len; i++) {
                if (i in t) {
                    var val = t[i]; // in case fn mutates this
                    if (fn.call(thisp, val, i, t)) {
                        res.push(val);
                    }
                }
            }
            return res;
        }
    }

    // the main object we use.
    function SPCalendarPro(obj, listType) {
        this.listName = (obj.listName) ? obj.listName : null;
        this.fields = obj.fields ? obj.fields : null;
        this.userDateTimes = (obj.userDateTimes) ? obj.userDateTimes : null;
        this.camlQuery = (obj.camlQuery) ? obj.camlQuery : null;
        this.where = (obj.where) ? obj.where : null;
        this.userEnvData = getUserEnvInfo(obj.sourceSite);
        this.async = (typeof obj.async === "undefined") ? true : obj.async;

        if (!Array.prototype.filter) {
            createArrayFilter();
        }

        this.ready = function(execCallback) {
            return this.userCallback = execCallback;
        }

        this.callback = function() {
            return (obj.callback) ? obj.callback(this) : null;
        }

        if (typeof obj.listName === "string") {
            this.CamlQuery = CamlBuilder(obj, listType);
            this.data = getListData(this, obj);
        } else {
            console.error('You must specify a list name.');
        }

        return this;
    }

    var data = {
        getCalendarEvents: function(obj) {
            return new SPCalendarPro(obj, 'calendar');
        },
        getListItems: function(obj) {
            return new SPCalendarPro(obj, 'list');
        },
        getDateTimesFromForm: function(row1, row2) {
            var time = convertFormDateTimes(row1, row2);
            return formatDateTimesToObj(time.userBeginDT, time.userEndDT);
        },
        userDates: function(dateTime1, dateTime2) {
            return formatDateTimesToObj(dateTime1, dateTime2);
        },
        disableDragAndDrop: function() {
            ExecuteOrDelayUntilScriptLoaded(disableDragDrop, 'SP.UI.ApplicationPages.Calendar.js');

            function disableDragDrop() {
                var calendarCreate = SP.UI.ApplicationPages.CalendarContainerFactory.create;
                SP.UI.ApplicationPages.CalendarContainerFactory.create = function(elem, cctx, viewType, date, startupData) {
                    if (cctx.dataSources && cctx.dataSources instanceof Array && cctx.dataSources.length > 0) {
                        for (var i = 0; i < cctx.dataSources.length; i++) {
                            cctx.dataSources[i].disableDrag = true;
                        }
                    }
                    calendarCreate(elem, cctx, viewType, date, startupData);
                }
            }
        }
    }

    return data;
}));