const GITHUB_URL = 'https://github.com/argentquest/protocol'
const SUGGESTIONS_URL = `${GITHUB_URL}/issues/new/choose`
const LINKEDIN_URL = 'https://www.linkedin.com/in/eric-silver-tx/'

/**
 * Presents the personal history, open-source status, and community invitations.
 *
 * @param {{onWorkshop: () => void}} props About-page navigation callbacks.
 * @returns {import('react').JSX.Element} Project About screen.
 */
export default function About({ onWorkshop }) {
  return (
    <main className="content-screen about-screen">
      <div className="screen-heading">
        <p className="eyebrow">Behind the protocol</p>
        <h1>A game built through curiosity.</h1>
        <p>
          I created Path Protocol as a personal experiment in building a
          browser-based game through AI-assisted development and experimentation.
        </p>
      </div>

      <section className="about-story" aria-label="The Path Protocol story">
        <article className="about-story__lead">
          <p className="about-story__chapter">01 // The idea</p>
          <h2>It started with my son.</h2>
          <p>
            The original concept came from an idea my son had. I had always
            wanted to create a miniature-golf game, and his idea gave me the
            opportunity to explore that interest while learning how a modern web
            game could be designed and built.
          </p>
        </article>

        <article>
          <p className="about-story__chapter">02 // The experiment</p>
          <h2>Learning by making.</h2>
          <p>
            I have worked on Path Protocol on and off over the past month. It
            began as an experiment in AI-assisted development and grew into a
            complete precision game with a deterministic engine, a Three.js
            presentation layer, and a campaign of playable levels.
          </p>
        </article>

        <article>
          <p className="about-story__chapter">03 // The workshop</p>
          <h2>More than one game.</h2>
          <p>
            Path Protocol is also an authoring system. The Theme Workshop lets
            people experiment with the application, create their own themes and
            levels, and discover different ways to shape the same core game.
          </p>
        </article>

        <article>
          <p className="about-story__chapter">04 // Open source</p>
          <h2>An invitation to explore.</h2>
          <p>
            I made the project open source under the MIT License because I want
            others to experiment with it, study how it works, build on the
            authoring tools, and suggest where it could go next. Contributions,
            questions, and constructive ideas are welcome.
          </p>
        </article>
      </section>

      <section className="about-invitation" aria-labelledby="about-invitation-title">
        <div>
          <p className="eyebrow">Join the experiment</p>
          <h2 id="about-invitation-title">Try it, change it, and share an idea.</h2>
          <p>
            Explore the source, build a theme or level, or open a suggestion on
            GitHub. Path Protocol was created by Eric Silver of ArgentQuest.
          </p>
        </div>
        <div className="about-actions">
          <a className="primary-button" href={GITHUB_URL} target="_blank" rel="noreferrer">
            View on GitHub <b aria-hidden="true">↗</b>
          </a>
          <button className="secondary-button" type="button" onClick={onWorkshop}>
            Open Theme Workshop
          </button>
          <a className="about-link" href={SUGGESTIONS_URL} target="_blank" rel="noreferrer">
            Make a suggestion
          </a>
          <a className="about-link" href={LINKEDIN_URL} target="_blank" rel="noreferrer">
            Connect with me on LinkedIn
          </a>
        </div>
      </section>
    </main>
  )
}
