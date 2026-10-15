import './SessionTitleNumber.scss';

/** Auxiliary identity stays outside the title's overflow and edit slots. */
export function SessionTitleNumber({ number }: { number?: string }) {
  return number ? (
    <span
      className="opc-session-title-number"
      data-opc-component="session-title-number"
      data-opc-part="root"
    >{number}</span>
  ) : null;
}
