import { createRoot } from 'react-dom/client';
import { Settings } from './Settings';
import '../styles.css';

const root = document.getElementById('root');
if (root) createRoot(root).render(<Settings/>);
