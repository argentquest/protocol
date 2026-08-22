import {
  tutorialLessons,
  tutorialPhases,
} from '../config/tutorialCurriculum.js'

/**
 * Renders the Aurora Academy tutorial: the six-phase progression and a
 * detailed lesson card for each of the 20 levels.
 *
 * @param {{onFieldGuide: () => void}} props Page navigation callbacks.
 * @returns {import('react').JSX.Element} Tutorial screen.
 */
export default function Tutorial({ onFieldGuide }) {
  /** @param {number} number Level number. @returns {object|null} The matching phase. */
  const phaseFor = (number) =>
    tutorialPhases.find(
      (phase) => number >= phase.range[0] && number <= phase.range[1],
    ) ?? null

  return (
    <main className="content-screen tutorial-screen">
      <div className="screen-heading">
        <p className="eyebrow">Aurora Academy</p>
        <h1>Twenty lessons. Every protocol.</h1>
        <p>
          A 20-level tutorial course that introduces each Path Protocol
          mechanic one lesson at a time. Read the objective before each run,
          follow the tip, and carry every skill into the final convergence.
        </p>
      </div>

      <section className="tutorial-arc" aria-label="Tutorial progression">
        <p className="eyebrow">The progression</p>
        <ol className="tutorial-arc__phases">
          {tutorialPhases.map((phase) => (
            <li key={phase.phase}>
              <span className="tutorial-arc__number">
                {String(phase.phase).padStart(2, '0')}
              </span>
              <strong>{phase.title}</strong>
              <small>
                {phase.range[0]}–{phase.range[1]}
              </small>
              <p>{phase.summary}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="tutorial-lessons" aria-label="The 20 lessons">
        {tutorialLessons.map((lesson) => {
          const phase = phaseFor(lesson.number)
          return (
            <article className="tutorial-lesson" key={lesson.number}>
              <div className="tutorial-lesson__meta">
                <span className="guide-index">
                  {String(lesson.number).padStart(2, '0')}
                </span>
                <div className="tutorial-lesson__badges">
                  <span className="tutorial-badge tutorial-badge--mode">
                    {lesson.mode}
                  </span>
                  <span className="tutorial-badge tutorial-badge--difficulty">
                    Difficulty {lesson.difficulty}
                  </span>
                  <span className="tutorial-badge tutorial-badge--phase">
                    {phase ? phase.title : 'Mastery'}
                  </span>
                </div>
              </div>
              <div className="tutorial-lesson__body">
                <p className="tutorial-lesson__category">{lesson.category}</p>
                <h2>{lesson.name}</h2>
                <p className="tutorial-lesson__objective">{lesson.briefing}</p>
                <p className="tutorial-lesson__detail">{lesson.detail}</p>
                <p className="tutorial-lesson__tip">
                  <strong>Tip:</strong> {lesson.tip}
                </p>
              </div>
            </article>
          )
        })}
      </section>

      <div className="guide-callout">
        <strong>Play the course.</strong>
        <span>
          Aurora Academy is a published campaign — pick it from the
          first-visit theme chooser, or seed it locally with{' '}
          <code>npm run seed:tutorial</code>. The in-game briefing on every
          level is the lesson objective shown above.
        </span>
        {onFieldGuide && (
          <button className="text-button" type="button" onClick={onFieldGuide}>
            Review the field guide <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
    </main>
  )
}
