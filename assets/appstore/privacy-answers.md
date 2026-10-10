# App Privacy answers

What to tick in App Store Connect's privacy questionnaire, and why. Derived
from what the app actually sends, not from what it could plausibly send.

Two facts decide most of the answers:

- **Nothing is used for tracking.** No advertising, no analytics SDK, no data
  broker, nothing linked with third-party data. Answer **No** to tracking for
  every type — which also means the app needs no App Tracking Transparency
  prompt.
- **The backend calls carry no identity.** `src/lib/ai.ts` posts to the API
  with no auth header and no user id, so everything that goes to the backend
  is *Not Linked* even though the account itself is identified.

## Tick these

| Data type | Linked to user? | Purpose | Where it comes from |
|---|---|---|---|
| Contact Info → **Email Address** | Linked | App Functionality | Supabase account |
| Contact Info → **Name** | Linked | App Functionality | `full_name` on the profile, set during setup |
| Identifiers → **User ID** | Linked | App Functionality | Supabase user id |
| Location → **Coarse Location** | **Not** linked | App Functionality | Weather widget |
| User Content → **Photos or Videos** | **Not** linked | App Functionality | Timetable import |
| User Content → **Other User Content** | Linked | App Functionality | Timetable, subjects, reminders, study sessions, study plans, textbook details, school and year level, theme |

## Leave everything else unticked

Health & Fitness, Financial Info, Sensitive Info, Contacts, Browsing History,
Search History, Purchases, Usage Data, Diagnostics, Surroundings, Body, Other
Data, and the remaining Contact Info and User Content rows.

No analytics or crash SDK is installed, so there is no Usage Data and no
Diagnostics to declare — Apple's own crash reporting is not collected by us.
There are no purchases of any kind in this version.

## The three calls worth knowing about

**Coarse, not Precise.** Apple's line is three or more decimal places of
latitude and longitude. `useWeather.ts` rounds to two — about a kilometre —
before anything leaves the device, and sends no account details with it.
Declaring Precise here would be wrong, and it is the usual place apps
over-declare.

**Photos are collected even though nothing is kept.** The timetable image goes
to the backend and on to the model to be read. It is processed in memory and
discarded, and the route persists nothing, but it still left the device, so it
is collected. Not linked, because the request carries no identity.

**Do not claim the optional-disclosure exemption for it.** That exemption needs
the collection to be no part of the app's primary functionality. Timetable
import is in the first paragraph of the App Store description, so it fails that
test.

## One judgement call

The textbook title, author and edition the user types are web-searched on the
server. Apple's *Search History* means searches performed in the app, and this
reads more like profile input than a search feature, so it is folded into
*Other User Content* — which is ticked anyway, so the data is disclosed either
way. Ticking *Search History* as well would cost nothing if a reviewer ever
disagreed.

## Keep it matching the policy

Apple compares this against the published policy. `backend/public/privacy.html`
already lists exactly this set — account details, study data, textbook details,
approximate location, imported photos and files — along with the four
processors (Supabase, Anthropic, Open-Meteo, Expo). Change one and change the
other.
