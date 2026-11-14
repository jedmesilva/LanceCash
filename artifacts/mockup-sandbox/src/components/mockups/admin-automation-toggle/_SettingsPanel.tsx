import { useState } from 'react';
import { Switch } from '@/components/ui/switch';

export function SettingsPanel({ visibleOffState = false }: { visibleOffState?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [savedEnabled, setSavedEnabled] = useState(false);
  const changed = enabled !== savedEnabled;

  return (
    <section className="adm-dialog" aria-labelledby="settings-title">
      <header className="adm-dialog-header">
        <p className="adm-eyebrow">AUTOMATION / SETTINGS</p>
        <h2 id="settings-title">System bids</h2>
        <p className="adm-dialog-description">Control automated bidding for the live auction.</p>
      </header>
      <div className="adm-switch-row">
        <div>
          <strong>Automated bidding</strong>
          <p>{enabled ? 'System bids are enabled.' : 'System bids are paused.'}</p>
        </div>
        <div className={visibleOffState ? 'adm-switch-control' : undefined}>
          {visibleOffState && (
            <span className={`adm-switch-state ${enabled ? 'is-on' : 'is-off'}`} aria-hidden="true">
              {enabled ? 'ON' : 'OFF'}
            </span>
          )}
          <Switch
            className={`adm-automation-switch${visibleOffState ? ' adm-automation-switch-visible' : ''}`}
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label={enabled ? 'Disable automated system bids' : 'Enable automated system bids'}
            data-testid="switch-system-bids"
          />
        </div>
      </div>
      <footer className="adm-dialog-footer">
        <button type="button" onClick={() => setEnabled(savedEnabled)}>Cancel</button>
        <button
          className="adm-primary-button"
          type="button"
          disabled={!changed}
          onClick={() => setSavedEnabled(enabled)}
        >
          Save setting
        </button>
      </footer>
    </section>
  );
}
