export default function Modal({ open, onClose, title, children, actions }) {
  return (
    <div
      className={`modal-overlay ${open ? 'open' : ''}`}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        {title && <h2>{title}</h2>}
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  )
}
