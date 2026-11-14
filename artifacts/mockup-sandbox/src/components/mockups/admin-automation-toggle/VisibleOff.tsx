import './_group.css';
import { SettingsPanel } from './_SettingsPanel';

export function VisibleOff() {
  return <main className="adm-toggle-preview"><SettingsPanel visibleOffState /></main>;
}
