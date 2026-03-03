'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth';
import { auth, billing } from '@/lib/api';
import { Badge, Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label } from '@opacore/ui';

export default function SettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const billingParam = searchParams.get('billing');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isPending, setIsPending] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState('');

  const { data: billingStatus } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => billing.status(),
  });

  async function handleUpgrade() {
    setBillingError('');
    setBillingLoading(true);
    try {
      const { url } = await billing.checkout();
      window.location.href = url;
    } catch {
      setBillingError('Failed to start checkout. Please try again.');
      setBillingLoading(false);
    }
  }

  async function handlePortal() {
    setBillingError('');
    setBillingLoading(true);
    try {
      const { url } = await billing.portal();
      window.location.href = url;
    } catch {
      setBillingError('Failed to open billing portal. Please try again.');
      setBillingLoading(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteError('');
    if (deleteConfirm !== 'delete') {
      setDeleteError('Please type "delete" to confirm.');
      return;
    }
    setIsDeleting(true);
    try {
      await auth.deleteAccount();
      router.push('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete account.';
      setDeleteError(message);
      setIsDeleting(false);
    }
  }

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
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Manage your subscription plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {billingParam === 'success' && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              Payment successful — you now have Pro access.
            </div>
          )}
          {billingParam === 'canceled' && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              Checkout canceled — no charge was made.
            </div>
          )}
          {billingError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {billingError}
            </div>
          )}

          {billingStatus ? (
            billingStatus.billing_enabled === false ? (
              <div className="flex items-center gap-3">
                <Badge variant="secondary">Self-hosted</Badge>
                <span className="text-sm text-muted-foreground">
                  All Pro features enabled — no subscription required.
                </span>
              </div>
            ) : billingStatus.plan === 'pro' && (billingStatus.status === 'active' || billingStatus.status === 'trialing') ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Badge className="bg-green-600 text-white">Pro</Badge>
                  <span className="text-sm text-muted-foreground">
                    Active
                    {billingStatus.current_period_end
                      ? ` · Renews ${new Date(billingStatus.current_period_end).toLocaleDateString()}`
                      : ''}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={handlePortal} disabled={billingLoading}>
                  {billingLoading ? 'Loading...' : 'Manage Billing →'}
                </Button>
              </div>
            ) : billingStatus.status === 'past_due' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Badge className="bg-amber-500 text-white">Pro</Badge>
                  <span className="text-sm text-amber-700">
                    Payment failed — update your payment method to keep access.
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={handlePortal} disabled={billingLoading}>
                  {billingLoading ? 'Loading...' : 'Manage Billing →'}
                </Button>
              </div>
            ) : billingStatus.status === 'canceled' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">Pro</Badge>
                  <span className="text-sm text-muted-foreground">
                    Canceled
                    {billingStatus.current_period_end
                      ? ` · Access until ${new Date(billingStatus.current_period_end).toLocaleDateString()}`
                      : ''}
                  </span>
                </div>
                <Button size="sm" onClick={handleUpgrade} disabled={billingLoading}>
                  {billingLoading ? 'Loading...' : 'Reactivate →'}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">Free Plan</Badge>
                  <span className="text-sm text-muted-foreground">
                    Upgrade to Pro to unlock Opacore Agent, API access, and Inheritance.
                  </span>
                </div>
                <Button size="sm" onClick={handleUpgrade} disabled={billingLoading}>
                  {billingLoading ? 'Loading...' : 'Upgrade to Pro →'}
                </Button>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Loading billing status...</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleteError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {deleteError}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">
              Type <strong>delete</strong> to confirm
            </Label>
            <Input
              id="delete-confirm"
              type="text"
              placeholder="delete"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
            />
          </div>
          <Button
            variant="destructive"
            onClick={handleDeleteAccount}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete Account'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
