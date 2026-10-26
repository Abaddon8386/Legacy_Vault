import LegacySharedWithMePage from './LegacySharedWithMePage.jsx';
import CaseLinkWorkspace from './CaseLinkWorkspace.jsx';

// Activate the replacement workflow only with an explicit adapter. Never fall
// back to invitation acceptance after a new-workflow request fails.
export default function SharedWithMePage(props) {
  return props.caseLinkActions !== undefined ? <CaseLinkWorkspace {...props} /> : <LegacySharedWithMePage {...props} />;
}
