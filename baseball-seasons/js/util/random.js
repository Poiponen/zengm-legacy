/**
 * @name util.random
 * @namespace Module to emulate some of Python's random library.
 */
define([], function () {
    "use strict";
    /**
     * Choose a random integer from [a, b]
     * 
     * @memberOf util.random
     * @param {number} a Minimum integer that can be returned.
     * @param {number} b Maximum integer that can be returned.
     * @return {number} Random integer between a and b.
     */
    function randInt(a, b) {
        return Math.floor(Math.random() * (1 + b - a)) + a;
    }

    /**
     * Shuffles a list in place, returning nothing.
     * 
     * @memberOf util.random
     * @param {array} list List to be shuffled in place.
     */
    function shuffle(list) {
        var i, j, l, t;

        l = list.length;
        for (i = 1; i < l; i++) {
            j = randInt(0, i);
            if (j !== i) {
                t = list[i];  // swap list[i] and list[j]
                list[i] = list[j];
                list[j] = t;
            }
        }
    }
	
	
	//// Testing shuffle of more than just a day
    /**
     * Shuffles a list in place, returning nothing.
     * 
     * @memberOf util.random
     * @param {array} list List to be shuffled in place.
     */
    function shuffleWeek(list) {
        var i, j, l, t;
		var week;

		week = 0;
        l = list.length;
		j = l;
        for (i = 1; i < l; i++) {
			
            //j = randInt(0, i);
            if (j !== i) {
                t = list[i];  // swap list[i] and list[j]
                list[i] = list[j];
                list[j] = t;
            }
			week +=1;
			j -=1;
			if (week == 7) {
			  week = 0;
			  i += 7;
			  j -= 7;
			}
			if (j> (i+7)) {
			  i = l;
			}
        }
    }
	
    /**
     * Shuffles a list in place, returning nothing.
     * 
     * @memberOf util.random
     * @param {array} list List to be shuffled in place.
     */
    function shuffle(list) {
        var i, j, l, t;

        l = list.length;
        for (i = 1; i < l; i++) {
            j = randInt(0, i);
            if (j !== i) {
                t = list[i];  // swap list[i] and list[j]
                list[i] = list[j];
                list[j] = t;
            }
        }
    }
		

    /**
     * Returns a random number from an approximately Gaussian distribution.
     * 
     * See: http://www.protonfish.com/random.shtml
     *
     * This is broken and realGauss below is much better. But some things might rely on this broken distribution.
     * 
     * @memberOf util.random
     * @param {number} mu Mean (default: 0).
     * @param {number} sigma Standard deviation (default: 1).
     * @return {number} Random number from Gaussian distribution.
     */
    function gauss(mu, sigma) {
        mu = mu !== undefined ? mu : 0;
        sigma = sigma !== undefined ? sigma : 1;
        return ((Math.random() * 2 - 1) + (Math.random() * 2 - 1) + (Math.random() * 2 - 1)) * sigma + mu;
    }

    /**
     * Returns a random number from an actually Gaussian distribution.
     * 
     * The following implements a random draw via the Marsaglia algorithm.
     * Note that not only is z_1 a random Gaussian, but so is z_2.
     * If generating random numbers turns out to be a bottleneck, we can
     * cut the time in half by caching z_2 rather than throwing it away.
     * For statistician's sake, z_1 and z_2 are also independent.
     *
     * The Gauss function above is broken, but I don't want to remove it in case
     * other things rely on it. So this is named after the illustrious
     * mysql_real_escape_string function from PHP.
     *
     * @memberOf util.random
     * @param {number} mu Mean (default: 0).
     * @param {number} sigma Standard deviation (default: 1).
     * @return {number} Random number from Gaussian distribution.
     */
    function realGauss(mu, sigma) {
        var marsaglia, radius, z_1, z_2;

        mu = mu !== undefined ? mu : 0;
        sigma = sigma !== undefined ? sigma : 1;

        do {
            z_1 = 2 * Math.random() - 1;
            z_2 = 2 * Math.random() - 1;
            radius = z_1 * z_1 + z_2 * z_2;
        } while (radius >= 1 || radius === 0); // only use inside the unit circle

        marsaglia = Math.sqrt(-2 * Math.log(radius) / radius);

        return (z_1 * marsaglia) * sigma + mu;
    }

    /**
     * Get a random number selected from a uniform distribution.
     * 
     * @memberOf util.random
     * @param {number} a Minimum number that can be returned.
     * @param {number} b Maximum number that can be returned.
     * @return {number} Random number from uniform distribution.
     */
    function uniform(a, b) {
        return Math.random() * (b - a) + a;
    }

    /**
     * Choose a random element from a non-empty array.
     * 
     * @memberOf util.random
     * @param {number} x Array to choose a random value from.
     */
    function choice(x) {
        return x[Math.floor(Math.random() * x.length)];
    }

    return {
        randInt: randInt,
        shuffle: shuffle,
        shuffleWeek: shuffleWeek,
        gauss: gauss,
        realGauss: realGauss,
        uniform: uniform,
        choice: choice
    };
});
