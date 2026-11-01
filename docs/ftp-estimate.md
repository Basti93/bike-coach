# FTP estimate without a test

The ramp test is optional. Without it, the app estimates the FTP. Checked on 2026-10-31; the full texts of Jackson, Nes, Hawley, Daniels and ACSM were not available, only abstracts and secondary sources. **The calculation is a rough guide, not a validated method.** The error is more likely above ±22%.

| Step | Calculation | Basis |
|---|---|---|
| VO2max from profile | 56.363 + 1.921·activity − 0.381·age − 0.754·BMI + 10.987·(male) | [Jackson 1990](https://www.bisp-surf.de/Record/PU199205048504), R 0.78, SEE 5.6, imprecise from 55. [Coefficients](https://websites.umich.edu/~exphysio/mvs.240/AdditonalLabs/PredVOmax.nonex.data3.5.pdf) from a secondary source |
| VO2max from 5 km | Daniels/Gilbert VDOT | [Formula](https://rundida.com/tools/vdot-calculator/) only at blog level, no validation for recreational athletes found |
| Lower of the two values | | Assumption |
| Cycling discount ×0.90 | | Assumption. Reference points only in athletes: [runners 10.5%](https://lida.sport-iat.de/ta/Record/4001929?lng=en), [triathletes 7%](https://pubmed.ncbi.nlm.nih.gov/2355824/) |
| Maximum power | (VO2 − 7)·kg / 1.8 / 6 | [ACSM, Swain 2000](https://read.qxmd.com/read/10907754/energy-cost-calculations-for-exercise-prescription-an-update). Applies submaximally up to 200 W, the application at maximum is an assumption |
| FTP = 75% of that | | Assumption from coaching sources. Not validated, see also [limits of FTP tests](https://pubmed.ncbi.nlm.nih.gov/29801189/) |
| Starting value: VO2 − 5.6 | | Assumption: the lower bound is caution, not a recommendation from any source |
| Upper limit without a test | 2.78 W/kg (male), 2.35 W/kg (otherwise) | "Fair" level [according to Allen/Coggan via Garmin](https://www8.garmin.com/manuals/webhelp/GUID-3A4F9C4A-8735-46C0-8DA9-65F11400B150/EN-US/GUID-1F58FA8E-09FF-4E51-B9B4-C4B83ED1D6CE.html). The choice of level is an assumption |

Example: 35 years old, male, 80 kg, 180 cm, activity 3, 5 km in 28 minutes: calculated 129 W, start 101 W. Without a run time: 167 W, start 139 W.

**Adjustment:** As long as there is no ramp test, "Zu leicht" ("too easy") raises the FTP by 5% and "Zu hart" ("too hard") lowers it by 10%, within the upper limit. "Zu leicht" only counts after at least 20 minutes with an IF of 0.65 or more and no sooner than 3 days after the last change, "Zu hart" no sooner than after 1 day. The rule is an own assumption, loosely based on [RPE and thresholds](https://pubmed.ncbi.nlm.nih.gov/35507232/).

**Sex:** Required for Jackson. "Keine Angabe" ("not specified") calculates like "Frau" ("female") (assumption, cautious).

**Safety:** According to [ACSM](https://digitalcommons.uri.edu/kinesiology_facpubs/180), inactive people with no symptoms or pre-existing condition can start at light to moderate intensity without clearance; with symptoms, get medical advice first.

Rejected: Matthews 1999 (only 36% correct quintiles), Nes 2011 (needs waist and resting heart rate), Cooper test (overestimates in untrained people). "Wie lange kannst du laufen" ("How long can you run") is not factored in, because there is no evidence-based conversion for it.
