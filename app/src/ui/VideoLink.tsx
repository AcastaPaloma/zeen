import { Icon } from './Icon'
import './video-link.css'

export const PRESENTATION_URL = 'https://youtu.be/xr7qsrr8dag'

/** Our presentation video, beside the phone mockup on wide screens. */
export function VideoLink() {
  return (
    <a className="video-link" href={PRESENTATION_URL} target="_blank" rel="noopener noreferrer" aria-label="Watch our presentation video on YouTube">
      <span className="vl-play" aria-hidden><Icon name="play" size={30} fill="currentColor" /></span>
      <span className="vl-text">
        <small>For the judges</small>
        <b>Watch our presentation</b>
        <span>Opens on YouTube <Icon name="arrowRight" size={13} /></span>
      </span>
    </a>
  )
}
