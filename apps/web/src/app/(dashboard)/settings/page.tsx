'use client';

import { useState } from 'react';
import { useSession } from '@/lib/auth';
import { auth } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label } from '@opacore/ui';

export default function SettingsPage() {
  const { data: session } = useSession();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (newPassword !== confirmPassword) {
      setStatus({ type: 'error', message: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      setStatus({ type: 'error', message: 'New password must be at least 8 characters.' });
      return;
    }

    setIsPending(true);
    try {
      await auth.changePassword({ current_password: currentPassword, new_password: newPassword });
      setStatus({ type: 'success', message: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update password.';
      setStatus({ type: 'error', message });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Name</label>
            <p className="text-sm">{session?.user?.name ?? '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Email</label>
            <p className="text-sm">{session?.user?.email ?? '-'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your login password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {status && (
              <div className={`rounded-md border p-3 text-sm ${
                status.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}>
                {status.message}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="current">Current Password</Label>
              <Input
                id="current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">New Password</Label>
              <Input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm New Password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
