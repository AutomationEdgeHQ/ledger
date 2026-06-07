'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { completeMfaChallenge, requestEmailMfaCode } from '../mfa-actions.js';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';

const MODE_LABELS = {
  totp: 'Authenticator code',
  email: 'Emailed code',
  recovery: 'Recovery code',
};

export function MfaChallengeForm({ emailBackupAvailable }) {
  const router = useRouter();
  const [mode, setMode] = useState('totp');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  function switchMode(next) {
    setMode(next);
    setCode('');
    setError('');
    setInfo('');
  }

  async function sendEmail() {
    setError('');
    setInfo('');
    setSending(true);
    try {
      const result = await requestEmailMfaCode();
      if (result?.error) setError(result.error);
      else setInfo('Code sent — check your inbox.');
    } catch {
      setError('Could not send code.');
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await completeMfaChallenge({ kind: mode, code });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.recoveryCodesRemaining !== null && result?.recoveryCodesRemaining !== undefined) {
        // Recovery code was just consumed — leave a breadcrumb on the next page.
        router.push(`/?recovery=${result.recoveryCodesRemaining}`);
      } else {
        router.push('/');
      }
      router.refresh();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Two-factor verification</CardTitle>
        <CardDescription>
          Enter the code from your authenticator app to finish signing in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mfa-code">{MODE_LABELS[mode]}</Label>
            <Input
              id="mfa-code"
              type="text"
              inputMode={mode === 'recovery' ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              placeholder={mode === 'recovery' ? 'XXXXX-XXXXX' : '123456'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-muted-foreground">{info}</p>}
          <Button type="submit" className="w-full" disabled={loading || !code}>
            {loading ? 'Verifying…' : 'Verify'}
          </Button>
        </form>

        <div className="mt-4 space-y-2 text-sm">
          {mode !== 'totp' && (
            <button
              type="button"
              className="block w-full text-left text-muted-foreground hover:text-foreground"
              onClick={() => switchMode('totp')}
            >
              Use authenticator app instead
            </button>
          )}
          {mode !== 'email' && emailBackupAvailable && (
            <button
              type="button"
              className="block w-full text-left text-muted-foreground hover:text-foreground"
              onClick={async () => {
                switchMode('email');
                await sendEmail();
              }}
              disabled={sending}
            >
              {sending ? 'Sending email code…' : 'Email me a code instead'}
            </button>
          )}
          {mode === 'email' && (
            <button
              type="button"
              className="block w-full text-left text-muted-foreground hover:text-foreground"
              onClick={sendEmail}
              disabled={sending}
            >
              {sending ? 'Resending…' : 'Resend email code'}
            </button>
          )}
          {mode !== 'recovery' && (
            <button
              type="button"
              className="block w-full text-left text-muted-foreground hover:text-foreground"
              onClick={() => switchMode('recovery')}
            >
              Use a recovery code instead
            </button>
          )}
          <button
            type="button"
            className="block w-full text-left text-muted-foreground hover:text-foreground"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            Cancel and sign out
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
