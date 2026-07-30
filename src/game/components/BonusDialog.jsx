/**
 * Presents the bank-or-pursue decision for one ordered bonus target.
 *
 * @param {object} props Dialog properties.
 * @returns {import('react').JSX.Element} Accessible modal content.
 */
export default function BonusDialog({ reward, onBank, onPursue }) {
  return (
    <div className="bonus-dialog-backdrop">
      <section
        className="bonus-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bonus-dialog-title"
      >
        <p className="eyebrow">Optional relay detected</p>
        <h2 id="bonus-dialog-title">Bonus target available</h2>
        <p>
          Bank the score you have now, or pursue the relay for up to{' '}
          {reward.toLocaleString()} extra points.
        </p>
        <p className="bonus-dialog__warning">
          Pursuing restarts mouse or keyboard control at this target. The clock
          keeps running, and toggling control off before the bonus target applies
          a 20% penalty.
        </p>
        <div className="bonus-dialog__actions">
          <button className="secondary-button" type="button" onClick={onBank}>
            Bank score
          </button>
          <button className="primary-button" type="button" onClick={onPursue} autoFocus>
            OK — pursue bonus
          </button>
        </div>
      </section>
    </div>
  )
}
