# Reply to App Review — Guideline 2.1, Information Needed

Everything between the two rules below is the reply. Paste that, with the
recording attached. The shot list after it is for you, not for Apple.

The textbook named in step 2 is the one the demo account's own plan was built
from, so its lessons are already in our shared cache and come back in seconds
rather than minutes. The author and edition fields have to be left blank —
the cache is keyed on exactly what is typed.

---

Thank you. Answers in order.

**1. SCREEN RECORDING**
Attached. Captured on a physical iPhone running the current iOS, from a cold launch: registration, onboarding, the main screens, a study session, a study plan and its lessons, and account deletion.

**2. PURPOSE AND AUDIENCE**
A study planner for secondary students, roughly 15 to 18, working toward end-of-school exams. Their timetable, deadlines and actual studying normally live in three unconnected places, so nothing joins what they are taught to what they ought to revise.

It reads the timetable in from a photograph or PDF, including ten-day cycles; tracks assignments and exams with reminders and countdowns; times study sessions and logs them against the right subject; and builds an ordered set of lessons for a subject from its textbook, aimed at an upcoming test or an area the student chooses.

**3. SETUP AND ACCESS**
Demo account:
Username: mystudyflowbusiness@gmail.com
Password: 123456

Pre-loaded with a timetable, reminders, study history and a theme, so most of the app can be reviewed at once. No sample files needed.

Study plans are built on demand and the account ships without one so that flow can be seen. Please build one only: each is a research pass plus a model call per lesson, ten to twenty of them, billed to us, and several in a row exhaust our rate limit.

To build one, about three minutes:
1. Subjects, then Mathematical Methods, then Build study profile.
2. Textbook title: Cambridge Maths Methods Units 1 And 2 — leave author and edition blank. Tap "Scan this textbook".
3. When the book and its units are listed, tap "Looks right".
4. Choose "Yes, I have a test", what it is on: Calculus, any date in December, "Yes, from the book".
5. Tap "Build my lesson map" and stay on the screen while it writes.
6. Open the subject for the lesson map, tap a lesson, then "Start 12 questions".

**4. EXTERNAL SERVICES**
Supabase — authentication and storage of the student's data.
Anthropic (Claude) — reads imported timetable images, researches the named textbook, writes the lessons and questions. Our requests carry no user identifier or account details.
Open-Meteo — weather for the optional clock widget; coordinates rounded to about one kilometre, no account details.
Railway — hosts our backend. Expo (EAS) — builds and app updates.
No advertising networks, analytics SDKs, payment processors or data brokers, and nothing is used for tracking.

**5. REGIONAL DIFFERENCES**
None. No geographic gating, region-specific content or locale-dependent behaviour. English only. The one location-aware feature, the optional weather widget, behaves identically everywhere.

**6. REGULATED INDUSTRY AND THIRD-PARTY MATERIAL**
Not a regulated industry: no medical, financial, legal or professional advice, not an accredited provider, examination board or credential issuer, and no claims about grades.

No textbook is hosted, copied or distributed. When a student names their textbook we identify it from public information and report only its bibliographic details and its chapter and topic names. Our instruction to the model is explicit: "Report the book's structure — chapter and topic names — as factual information. Do NOT reproduce the book's actual teaching text, worked examples, exercises or any substantial passage from it." Lessons are then written from scratch against a topic name, with no access to the book, so they are original and need no publisher licence. We claim no affiliation with any publisher.

Lesson content is written by a language model, which the app and our support page both state.

**ALSO**
- All content is private to the account that created it. No sharing, social features or communication between users, so no content reporting or blocking mechanism applies.
- Account deletion is in the app: Profile, then Delete Account.
- No in-app purchases, paid features or paywall. No payment details are collected.

---

## Shot list for the recording

Physical iPhone, current iOS, Control Centre recording. Build the study plan
*before* recording so step 7 is not three minutes of progress bar. Four to six
minutes is plenty.

1. Cold launch from the iPhone home screen — the icon, then the welcome screen.
2. Create account with a throwaway address — use 8+ characters, sign-up
   enforces it — then onboarding: name, school, year level, colours.
3. Profile, then Delete Account, confirm, back to the welcome screen. This is
   the step Apple is most likely to be looking for, so it goes early.
4. Sign in with the demo account.
5. Home, Timetable, Reminders, Subjects, study stats — a few seconds each.
6. Start a study session, let it run, finish it, show the time logged against
   the subject.
7. Open the subject with the plan built, show the lesson map, open a lesson,
   then the question set.
