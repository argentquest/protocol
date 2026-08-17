# Path Protocol Community Launch Strategy

## Objective

Introduce Path Protocol as a personal, playable open-source experiment and
invite three kinds of participation:

1. Players who will try the game and describe where it feels satisfying or
   frustrating.
2. Creators who will experiment with the Theme Workshop and build courses or
   themes.
3. Developers who will inspect the architecture, suggest improvements, report
   bugs, or contribute focused pull requests.

The campaign should sound like Eric sharing something he made and wants to
learn from. It should not sound like a product launch from a large company.

## Canonical links

- Play: <https://app.inkandquill.io/protocol/>
- Source: <https://github.com/argentquest/protocol>
- Project discussions: <https://github.com/argentquest/protocol/discussions>
- Eric Silver: <https://www.linkedin.com/in/eric-silver-tx/>

Use the tracked play links in [`POST_LIBRARY.md`](POST_LIBRARY.md) when posting.
Keep the plain GitHub URL visible so readers know immediately that the source is
available.

## Launch gate

Do not begin the public campaign until all of these are true:

- Production deployment issue
  [#17](https://github.com/argentquest/protocol/issues/17) is complete.
- The public URL serves built assets and does not expose Vite development
  modules or hot reload.
- A new visitor can play without an account.
- The privacy and analytics consent flow works.
- The repository README, contribution guidance, and social preview are current.
- The owner has tested both links in a signed-out browser window.

Until then, the posts and images are campaign drafts, not publication approval.

## Positioning

The consistent one-sentence description is:

> Path Protocol is an open-source browser precision game with 100 mini-golf-
> inspired levels and a Theme Workshop for building your own courses.

The four recurring story pillars are:

- **Personal origin:** the idea came from Eric's son; no name or identifying
  details are used.
- **Learning in public:** Eric used AI-assisted development to explore how a
  web-based game, deterministic engine, and Three.js renderer fit together.
- **Playable experiment:** people can try the game, not merely read about it.
- **Open invitation:** the MIT-licensed source, issues, and discussions are open
  to thoughtful experimentation and suggestions.

## Channel priorities

### 1. LinkedIn

Lead with Eric's personal account and the origin-story image. LinkedIn is the
best fit for the personal learning story, AI-assisted development, and an
invitation to professional peers. Follow with the participation infographic and
Theme Workshop card on different days.

Use one image per post when a clickable URL is essential, or put the URL in the
post text and first comment after checking the rendered preview. LinkedIn accepts
photos from 3:1 through 4:5, recommends at least 1080 pixels of width, and lets
authors add alt text. The supplied portrait images use 4:5. LinkedIn's current
guidance is at <https://www.linkedin.com/help/linkedin/answer/a527229/>.

### 2. GitHub

Upload `path-protocol-social-preview.jpg` in repository **Settings → Social
preview**. It is 1280 × 640 and below GitHub's 1 MB limit. Pin a welcome
discussion asking players, authors, and developers what they tried. Use issues
for actionable defects and Discussions for broader ideas.

GitHub's preview instructions are at
<https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview>.

### 3. Developer communities

- Submit a factual **Show HN** only after the hosted game is ready. Link directly
  to the playable application, add the personal and technical context in the
  first comment, stay available to answer questions, and never ask anyone to
  upvote. Follow <https://news.ycombinator.com/showhn.html>.
- Publish a longer DEV Community article about the fixed-step engine,
  Three.js/React boundary, Theme Workshop, and lessons from AI-assisted
  development. The article should teach something even if the reader never
  clicks the project link.
- Share in relevant open-source, JavaScript, Three.js, web-game, and indie-game
  communities only when their rules allow project promotion.

### 4. Reddit and community forums

Choose one genuinely relevant community at a time. Read its rules, participate
in other discussions, and ask moderators before posting if the policy is
unclear. Tailor the title and question to that community instead of copying the
same announcement everywhere. Reddit notes that promotional content is not
automatically spam, but individual communities may prohibit it or apply a 10%
self-promotion convention:
<https://support.reddithelp.com/hc/en-us/articles/28012014962580>.

### 5. Short social feeds

Use Bluesky or Mastodon for concise progress notes, screenshots, and specific
questions. These posts work best as a continuing build log, not as repeated
link drops. Reuse the square Theme Workshop card and alternate it with real game
screenshots.

## Four-week cadence

Do not publish identical messages across every channel on the same day. Reframe
the story for each audience and leave time to answer responses.

| Timing | Theme | Primary channel | Asset | Call to action |
| --- | --- | --- | --- | --- |
| Day 1 | Personal launch | LinkedIn | Origin story | Try one level and tell me how control feels |
| Day 3 | Play invitation | Bluesky/Mastodon | Social preview | Share a score or confusing moment |
| Day 5–7 | Technical launch | Show HN or DEV | Gameplay screenshot | Inspect the code and discuss architecture |
| Week 2, post 1 | Three ways to join | LinkedIn | Participation infographic | Choose play, build, or contribute |
| Week 2, post 2 | What AI helped with | LinkedIn/DEV | Real screenshot | Ask about the development process |
| Week 3 | Theme authoring | LinkedIn and creator communities | Theme Workshop | Create or suggest a course idea |
| Week 4 | What changed from feedback | All active channels | Before/after or screenshot | Return and try the improvement |

After the first month, post only when there is a meaningful story: a community
theme, a substantial feature, a lesson learned, a release, or a concrete request
for help. One useful update every two to four weeks is better than repetitive
promotion.

## Engagement routine

- End each post with one specific question.
- Reply to substantive comments within one day when practical.
- Thank people for defects and turn reproducible reports into GitHub issues.
- Ask permission before quoting a tester or showing a community-created theme.
- Never ask for upvotes, mass-message people, or repeatedly post the same link.
- Spend more time contributing useful replies in a community than promoting the
  project there.

## Measurement

Use the UTM links in the post library. Review aggregate GA4 acquisition data
after 24 hours, seven days, and 28 days. Record:

- visits and engaged sessions by source;
- first-level starts and completions, if those events are available;
- GitHub stars, forks, issues, discussions, and pull requests;
- Theme Workshop use and published community themes, using privacy-safe
  aggregate measures;
- the questions and objections repeated in comments.

Do not optimize only for impressions. The useful outcome is a person who plays,
builds, reports something actionable, or returns.

## Media

The finished image inventory, dimensions, alt text, and generation provenance
are in [`../../public/media/social/campaign/README.md`](../../public/media/social/campaign/README.md).

