/* Moon illumination adapted from SunCalc v1.9.0 (BSD-2-Clause).
 * https://github.com/mourner/suncalc
 * Copyright (c) 2014, Vladimir Agafonkin
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification, are
 * permitted provided that the following conditions are met:
 *
 *    1. Redistributions of source code must retain the above copyright notice, this list of
 *       conditions and the following disclaimer.
 *
 *    2. Redistributions in binary form must reproduce the above copyright notice, this list
 *       of conditions and the following disclaimer in the documentation and/or other materials
 *       provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
 * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */
export function moonIllumination(date = new Date()) {
  const rad = Math.PI / 180,
    d = +date / 86400000 - 0.5 + 2440588 - 2451545,
    e = rad * 23.4397;
  const dec = (l, b) =>
    Math.asin(
      Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l),
    );
  const ra = (l, b) =>
    Math.atan2(
      Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e),
      Math.cos(l),
    );
  const M = rad * (357.5291 + 0.98560028 * d),
    C =
      rad *
      (1.9148 * Math.sin(M) +
        0.02 * Math.sin(2 * M) +
        0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI,
    sun = { dec: dec(L, 0), ra: ra(L, 0) };
  const ml = rad * (218.316 + 13.176396 * d),
    mm = rad * (134.963 + 13.064993 * d),
    mf = rad * (93.272 + 13.22935 * d);
  const l = ml + rad * 6.289 * Math.sin(mm),
    b = rad * 5.128 * Math.sin(mf),
    dist = 385001 - 20905 * Math.cos(mm),
    mdec = dec(l, b),
    mra = ra(l, b);
  const phi = Math.acos(
    Math.min(
      1,
      Math.max(
        -1,
        Math.sin(sun.dec) * Math.sin(mdec) +
          Math.cos(sun.dec) * Math.cos(mdec) * Math.cos(sun.ra - mra),
      ),
    ),
  );
  const inc = Math.atan2(
    149598000 * Math.sin(phi),
    dist - 149598000 * Math.cos(phi),
  );
  const angle = Math.atan2(
    Math.cos(sun.dec) * Math.sin(sun.ra - mra),
    Math.sin(sun.dec) * Math.cos(mdec) -
      Math.cos(sun.dec) * Math.sin(mdec) * Math.cos(sun.ra - mra),
  );
  return {
    fraction: (1 + Math.cos(inc)) / 2,
    phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,
  };
}
export function moonPhaseName(phase) {
  const names = [
    "New moon",
    "Waxing crescent",
    "First quarter",
    "Waxing gibbous",
    "Full moon",
    "Waning gibbous",
    "Last quarter",
    "Waning crescent",
  ];
  return names[Math.round(phase * 8) % 8];
}
