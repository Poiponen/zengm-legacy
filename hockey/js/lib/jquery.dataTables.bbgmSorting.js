/*global jQuery */
(function ($) {
    "use strict";

	
   /**
     * Based on http://www.datatables.net/examples/plug-ins/sorting_plugin.html
     *
     * Designed for a negative/positive column in Hockey GM, like plusminus or diff
     *     +100
     *     -50
     *     ...
     */
	 
	 // why doesn't this show up when just integers with negative signs?
    $.fn.dataTableExt.aTypes.unshift(
        function (sData) {
            var bM, bSomething, Char, i, iDollarSign, sValidChars;


			
            iDollarSign = sData.indexOf("-");
			//console.log(sData+"got here2"+iDollarSign);
			//console.log(sData+" "+iDollarSign);			
            if (iDollarSign < 0) {
                return null;
            }

				
            bSomething = false;
            bM = false;
            sValidChars = "0123456789-";

            for (i = iDollarSign + 1; i < sData.length; i++) {
                Char = sData.charAt(i);
                if (sValidChars.indexOf(Char) === -1) {
					//console.log(i+" "+Char+" "+sValidChars.indexOf(Char)+"got here2");
					
                    return null;
                }
                bSomething = true;  // Didn't return, so something is there

            /*    if (Char === "M") {
                    bM = true;
                    break;
                }*/
            }

            if (bSomething) {
                return "plusminus";
            }

			
            return null;
        }
    );
    $.fn.dataTableExt.oSort["plusminus-asc"] = function (a, b) {
        var x, y;

		if (a.indexOf("-") == -1) {
			x = parseFloat(a.substring(0, a.length-1));
		
		} else {
			x = parseFloat(a.substring(a.indexOf("-") + 1, a.length-1));
		}
		if (a.indexOf("-") == -1) {
			y = parseFloat(b.substring(0, b.length-1));
		
		} else {
			y = parseFloat(b.substring(b.indexOf("-") + 1, b.length-1));
		}		

        // Fix for negative signs before the dollar sign
        if (a[0] === "-") { x = -x; }
        if (b[0] === "-") { y = -y; }

        if (x > y) {
            return 1;
        }
        if (x < y) {
            return -1;
        }
        return 0;
    };
    $.fn.dataTableExt.oSort["plusminus-desc"] = function (a, b) {
        var x, y;

		if (a.indexOf("-") == -1) {
			x = parseFloat(a.substring(0, a.length-1));
		
		} else {
			x = parseFloat(a.substring(a.indexOf("-") + 1, a.length-1));
		}
		if (a.indexOf("-") == -1) {
			y = parseFloat(b.substring(0, b.length-1));
		
		} else {
			y = parseFloat(b.substring(b.indexOf("-") + 1, b.length-1));
		}		

        // Fix for negative signs before the dollar sign
        if (a[0] === "-") { x = -x; }
        if (b[0] === "-") { y = -y; }


        if (x > y) {
            return -1;
        }
        if (x < y) {
            return 1;
        }
        return 0;
    };
	
	
    /**
     * Based on http://www.datatables.net/examples/plug-ins/sorting_plugin.html
     *
     * Designed for a draft pick column in Basketball GM, like
     *     1-1
     *     1-2
     *     ...
     *     2-1
     *     2-2
     *     ...
     */
    $.fn.dataTableExt.aTypes.unshift(
        function (sData) {
            var bDash, bDigitAfterDash, bDigitBeforeDash, Char, i, sValidChars;

		
		//	console.log("got here other");						
            bDash = false;
            bDigitBeforeDash = false;
            bDigitAfterDash = false;
            sValidChars = "0123456789-";

			if (sData.charAt(0) == "-") {
			   return null;
			}
			
            for (i = 0; i < sData.length; i++) {
                Char = sData.charAt(i);
                if (sValidChars.indexOf(Char) === -1) {
                    return null;
                }

                // Need a digit after dash
                if (Char !== "-" && !bDash) {
                    bDigitBeforeDash = true;
                }

                /* Only allowed one dash place... */
                if (Char === "-") {
                    if (bDash) {
                        return null;
                    }
                    bDash = true;
                }

                // Need a digit after dash
                if (Char !== "-" && bDash) {
                    bDigitAfterDash = true;
                }
            }


            if (bDash) {
                return "numeric-dash";
            }

            return null;
        }
    );
    $.fn.dataTableExt.oSort["numeric-dash-asc"] = function (a, b) {
        var x, y;

        x = a.split("-");
        y = b.split("-");

        if (x.length !== 2 || y.length !== 2) {
            return 0;
        }

        x[0] = parseFloat(x[0]);
        x[1] = parseFloat(x[1]);
        y[0] = parseFloat(y[0]);
        y[1] = parseFloat(y[1]);

        if (x[0] > y[0]) {
            return 1;
        }
        if (x[0] < y[0]) {
            return -1;
        }
        if (x[1] > y[1]) {
            return 1;
        }
        if (x[1] < y[1]) {
            return -1;
        }
        return 0;
    };
    $.fn.dataTableExt.oSort["numeric-dash-desc"] = function (a, b) {
        var x, y;

        x = a.split("-");
        y = b.split("-");

        if (x.length !== 2 || y.length !== 2) {
            return 0;
        }

        x[0] = parseFloat(x[0]);
        x[1] = parseFloat(x[1]);
        y[0] = parseFloat(y[0]);
        y[1] = parseFloat(y[1]);

        if (x[0] > y[0]) {
            return -1;
        }
        if (x[0] < y[0]) {
            return 1;
        }
        if (x[1] > y[1]) {
            return -1;
        }
        if (x[1] < y[1]) {
            return 1;
        }
        return 0;
    };

    /**
     * Based on http://www.datatables.net/examples/plug-ins/sorting_plugin.html
     *
     * Designed for a monetary column in Basketball GM, like a contract
     *     $9.50M thru 2023
     *     $19.50M thru 2022
     *     ...
     * or just an amount of money
     *     -$15.2M
     *     $2.6M
     *     ...
     */
    $.fn.dataTableExt.aTypes.unshift(
        function (sData) {
            var bM, bSomething, Char, i, iDollarSign, sValidChars;

		//	console.log("got here $");						
		
            iDollarSign = sData.indexOf("$");
            if (iDollarSign < 0) {
                return null;
            }
		//	console.log(sData+"got here2");

            bSomething = false;
            bM = false;
            sValidChars = "0123456789-.M";

            for (i = iDollarSign + 1; i < sData.length; i++) {
                Char = sData.charAt(i);
                if (sValidChars.indexOf(Char) === -1) {
                    return null;
                }
                bSomething = true;  // Didn't return, so something is there

                if (Char === "M") {
                    bM = true;
                    break;
                }
            }

            if (bSomething && bM) {
                return "money";
            }

            return null;
        }
    );
    $.fn.dataTableExt.oSort["money-asc"] = function (a, b) {
        var x, y;

        x = parseFloat(a.substring(a.indexOf("$") + 1, a.indexOf("M")));
        y = parseFloat(b.substring(b.indexOf("$") + 1, b.indexOf("M")));

        // Fix for negative signs before the dollar sign
        if (a[a.indexOf("$") - 1] === "-") { x = -x; }
        if (b[b.indexOf("$") - 1] === "-") { y = -y; }

        if (x > y) {
            return 1;
        }
        if (x < y) {
            return -1;
        }
        return 0;
    };
    $.fn.dataTableExt.oSort["money-desc"] = function (a, b) {
        var x, y;

        x = parseFloat(a.substring(a.indexOf("$") + 1, a.indexOf("M")));
        y = parseFloat(b.substring(b.indexOf("$") + 1, b.indexOf("M")));

        // Fix for negative signs before the dollar sign
        if (a[a.indexOf("$") - 1] === "-") { x = -x; }
        if (b[b.indexOf("$") - 1] === "-") { y = -y; }

        if (x > y) {
            return -1;
        }
        if (x < y) {
            return 1;
        }
        return 0;
    };

    /**
     * Based on http://www.datatables.net/examples/plug-ins/sorting_plugin.html
     *
     * Designed to sort by last name in Basketball GM, like
     *     Bob Smith
     *     John Anderson
     *     ...
     * Other content (like "skills" span) is allowed to appear after the name
     */
    $.fn.dataTableExt.aTypes.unshift(
        function (sData) {
            var bM, bSomething, Char, i, iDollarSign, sValidChars;

			 iDollarSign = sData.indexOf("-");
			//console.log(sData+" "+iDollarSign);			
            if (iDollarSign > 0) {
                return null;
            }
            // This is kind of messy... the first condition is to match anything that looks like a name. The second is to catch a series of Three Capitalized Words that occur inside an HTML tag, as in a list of team names ("New York Knights").
            if (sData.match(/[A-Z][a-z]+ [A-Z][A-Z|a-z]+/) && !sData.match(/>[A-Z][a-z]+ [A-Z][A-Z|a-z]+ [A-Z][a-z]+/)) {
                return "name";
            }

            return null;
        }
    );
    $.fn.dataTableExt.oSort["name-asc"] = function (a, b) {
        var x, xName, y, yName;

        x = a.match(/[A-Z][a-z]+ [A-Z][A-Z|a-z]+/)[0].split(' ');
        y = b.match(/[A-Z][a-z]+ [A-Z][A-Z|a-z]+/)[0].split(' ');

        if (x[1] > y[1]) {
            return 1;
        }
        if (x[1] < y[1]) {
            return -1;
        }
        if (x[0] > y[0]) {
            return 1;
        }
        if (x[0] < y[0]) {
            return -1;
        }
        return 0;
    };
    $.fn.dataTableExt.oSort["name-desc"] = function (a, b) {
        var x, xName, y, yName;

        x = a.match(/[A-Z][a-z]+ [A-Z][A-Z|a-z]+/)[0].split(' ');
        y = b.match(/[A-Z][a-z]+ [A-Z][A-Z|a-z]+/)[0].split(' ');

        if (x[1] > y[1]) {
            return -1;
        }
        if (x[1] < y[1]) {
            return 1;
        }
        if (x[0] > y[0]) {
            return -1;
        }
        if (x[0] < y[0]) {
            return 1;
        }
        return 0;
    };
}(jQuery));