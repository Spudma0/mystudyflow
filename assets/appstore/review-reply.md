# Reply to App Review — Guideline 2.1, Information Needed

Paste the body below into **Reply to App Review**, with the screen recording
attached. A condensed version belongs in the Notes field as well; that is
`review-notes.txt`.

---

Thank you. The information requested follows, in the same order.

**1. Screen recording**

Attached. It is captured on a physical iPhone running the current iOS, begins
with a cold launch, and covers account registration, onboarding, the main
screens, a study session, building a study plan, reading a lesson, and account
deletion.

**2. Purpose and target audience**

MyStudyFlow is a study planner for secondary school students, roughly ages 15
to 18, who are working toward end-of-school examinations.

The problem it solves: a student's class timetable, their deadlines, and their
actual studying live in three unconnected places — a printed timetable, a
diary or notes app, and nothing at all for the studying itself. Nothing joins
what a student is taught to what they ought to revise, so revision tends to be
unplanned and the student has no idea where their hours actually went.

What the app does: it reads the school timetable in from a photograph or PDF,
including ten-day fortnightly cycles; tracks assignments and exams with
reminders and countdowns; times study sessions and logs them against the right
subject automatically; and builds an ordered set of lessons for a subject from
the textbook that subject is taught from, aimed either at a specific upcoming
test or at an area the student wants to go deeper on.

The value is that the student can see where their time is really going, and
opens a plan rather than a blank page.

**3. Setting up and accessing the main features**

Demo account:

    Username: mystudyflowbusiness@gmail.com
    Password: 123456

It is pre-loaded with a timetable, reminders, study history and a custom
theme, so the timetable, reminders, statistics, themes and profile areas can
be reviewed immediately.

Study plans are generated on demand, and the demo account deliberately ships
without one so that the generation flow can be seen. Please build one, and
only one — each build is a research pass plus one model call per lesson,
typically ten to twenty of them, billed to us; building several in a row can
exhaust our rate limit and begin returning errors, which is our quota rather
than a defect.

To build one, about five minutes end to end:

1. Subjects tab, then Mathematical Methods, then Build study profile.
2. Textbook step. Enter: Title "Mathematical Methods VCE Units 3&4"; Author
   "Michael Evans, Kay Lipson, David Greenwood"; Edition "2nd". Tap "Scan this
   textbook". This searches the web to identify the book and can take up to
   three minutes; a long wait here is expected, not a hang.
3. Scan step. The identified book and its units are listed. Tap "Looks right".
4. Test step. Either branch works. "Yes, I have a test" — What's it on:
   "Arithmetic and geometric sequences", any date a fortnight out, "Yes, from
   the book". Or "Not right now" — choose a suggested area.
5. Tap "Build my lesson map" and stay on the screen while each lesson is
   written.
6. Open the subject for the lesson map, tap a lesson to read it, and use
   "Start 12 questions" for the question set.

No sample files are needed. Timetable import accepts any photograph or PDF of
a school timetable, but the demo account already has a timetable loaded.

**4. External services**

| Service | Role | What it receives |
| --- | --- | --- |
| Supabase | Authentication and data storage | Account email, display name, and the student's own study data |
| Anthropic (Claude) | Reads imported timetable images; researches the named textbook; writes the lessons and questions | The timetable image, and the subject, textbook and topic text the student enters. Our requests carry no user identifier and no account details |
| Open-Meteo | Current conditions for the optional clock widget | Coordinates rounded to about one kilometre. No account details, no identifier |
| Railway | Hosts our backend | — |
| Expo (EAS) | Builds the app and delivers updates | App version and device platform |

There are no advertising networks, no analytics or attribution SDKs, and no
payment processors. Nothing is shared with data brokers and nothing is used
for tracking.

**5. Regional differences**

There are none. The app behaves identically in every region. There is no
geographic gating, no region-specific content, and no locale-dependent
behaviour anywhere in the code. The interface is English only. The sole
location-aware feature is the optional weather widget, which asks a public
weather API for conditions near the device and works the same everywhere.
Textbook research works for any textbook documented publicly; results are
naturally richer for widely documented curricula, but nothing is restricted by
region.

**6. Regulated industry and third-party material**

MyStudyFlow is a general-purpose study planner and is not in a regulated
industry. It offers no medical, financial, legal or other professional advice.
It is not an accredited education provider, examination board or credential
issuer, it is not affiliated with any school or examination authority, and it
makes no claims about grades or outcomes.

On third-party material: the app does not host, copy, or distribute any
textbook, and no publisher content is stored or transmitted by us. When a
student names the textbook their class uses, the service identifies that book
from publicly available information — publisher listings, syllabus and
curriculum documents — and reports only factual bibliographic details and the
book's structure, meaning its chapter and topic names. The instruction our
service gives the model is explicit on this point:

> Report the book's structure — chapter and topic names — as factual
> information. Do NOT reproduce the book's actual teaching text, worked
> examples, exercises or any substantial passage from it; only name what each
> part covers.

The lessons themselves are then written from scratch against a topic name,
with no access to the book and no web access at that stage. They are original
explanatory material, in the way a tutor who knows the syllabus writes their
own notes. We therefore require no publisher licence or credential, and we
claim no affiliation with or endorsement by any publisher.

Lesson material is written by a language model, which the app states in the
app itself and on the support page, and students are told to check anything
that matters against their own course material.

**Also, in case it is relevant to the checks listed:**

- User-generated content is private to the account that created it. There is
  no sharing, no social features, no public content and no communication
  between users, so no content reporting or blocking mechanism applies.
- Account deletion is in the app: Profile, then Delete Account. It removes the
  account and everything stored against it.
- There are no in-app purchases, no paid features and no paywall in this
  version. Nothing in the app collects payment details.
- Support: https://mystudyflow-production.up.railway.app/support
  Privacy: https://mystudyflow-production.up.railway.app/privacy

---

## Shot list for the recording

Physical iPhone, current iOS, screen recording from Control Centre. Apple asks
for registration, login and deletion, so record a throwaway account for that
part and sign in to the demo account for the rest. Four to six minutes is
plenty.

1. Cold launch from the iPhone home screen — the app icon, then the welcome
   screen.
2. Create account: register a throwaway address, go through onboarding — name,
   school, year level, colours.
3. Home screen, then Timetable, Subjects, Reminders — a few seconds each.
4. Start a study session, let the timer run briefly, finish it, and show the
   time landing against the subject.
5. Profile, then Delete Account, confirm, and land back on the welcome screen.
   This is the one Apple is most likely to look for.
6. Sign in with the demo account to show the populated app.
7. Open a subject with the study plan built, show the lesson map, open a
   lesson, and start the question set.

Build the study plan *before* recording so step 7 does not sit on a progress
bar for several minutes.
