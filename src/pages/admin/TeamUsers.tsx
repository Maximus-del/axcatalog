import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";

interface UserRow {
  id: string;
  organization_id: string | null;
  full_name: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
}

interface TempPasswordInfo {
  name: string;
  email: string;
  tempPassword: string;
  mode: "created" | "reset";
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}

const roleBadgeClass: Record<string, string> = {
  admin: "bg-accent text-accent-foreground",
  member: "bg-muted text-muted-foreground",
};

export default function TeamUsers() {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const [tempInfo, setTempInfo] = useState<TempPasswordInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setOrgId(data?.organization_id ?? null));
  }, [user?.id]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, organization_id, full_name, email, role, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as UserRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [rows],
  );

  const handleCreate = async () => {
    if (!newName.trim()) return toast.error("Full name is required");
    if (!newEmail.trim()) return toast.error("Email is required");
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("admin-manage-users", {
      body: {
        action: "create",
        email: newEmail.trim(),
        full_name: newName.trim(),
      },
    });
    setCreating(false);
    const errMsg =
      (data as any)?.error || (error as any)?.context?.error || error?.message;
    if (errMsg) {
      toast.error(typeof errMsg === "string" ? errMsg : "Could not add user");
      return;
    }
    setTempInfo({
      name: newName.trim(),
      email: (data as any).email,
      tempPassword: (data as any).tempPassword,
      mode: "created",
    });
    setCreateOpen(false);
    setNewName("");
    setNewEmail("");
    load();
  };

  const handleReset = async () => {
    if (!resetTarget) return;
    setBusyId(resetTarget.id);
    const { data, error } = await supabase.functions.invoke("admin-manage-users", {
      body: { action: "reset_password", user_id: resetTarget.id },
    });
    setBusyId(null);
    const errMsg =
      (data as any)?.error || (error as any)?.context?.error || error?.message;
    if (errMsg) {
      toast.error(typeof errMsg === "string" ? errMsg : "Couldn't reset");
      return;
    }
    setTempInfo({
      name: resetTarget.full_name || resetTarget.email || "this user",
      email: resetTarget.email ?? "",
      tempPassword: (data as any).tempPassword,
      mode: "reset",
    });
    setResetTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    const { data, error } = await supabase.functions.invoke("admin-manage-users", {
      body: { action: "delete", user_id: deleteTarget.id },
    });
    setBusyId(null);
    const errMsg =
      (data as any)?.error || (error as any)?.context?.error || error?.message;
    if (errMsg) {
      toast.error(typeof errMsg === "string" ? errMsg : "Couldn't remove");
      return;
    }
    toast.success("User removed");
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const copyPassword = () => {
    if (!tempInfo) return;
    navigator.clipboard
      .writeText(tempInfo.tempPassword)
      .then(() => toast.success("Password copied"))
      .catch(() => toast.error("Couldn't copy"));
  };

  return (
    <div className="p-4 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">System</div>
          <h1 className="text-3xl font-bold">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Admins and members with access to the AthleteXclusive OS.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add user
        </Button>
      </header>

      <div className="ax-card p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Full name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  No team members yet — add your first user.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => {
                const isMe = r.id === user?.id;
                const role = (r.role ?? "member").toLowerCase();
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.full_name ?? "—"}
                      {isMe && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={roleBadgeClass[role] ?? "bg-muted text-muted-foreground"}
                      >
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>{fmtDate(r.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setResetTarget(r)}
                          disabled={busyId === r.id}
                        >
                          <KeyRound className="h-3.5 w-3.5 mr-1" />
                          Reset password
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(r)}
                          disabled={busyId === r.id || isMe}
                          title={isMe ? "You can't remove yourself" : "Remove"}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add user dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Creates an admin account and generates a one-time temporary password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="uname">Full name</Label>
              <Input
                id="uname"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uemail">Email</Label>
              <Input
                id="uemail"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="jane@athletexclusive.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "Add user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Temp password reveal — shown once */}
      <Dialog
        open={!!tempInfo}
        onOpenChange={(open) => {
          if (!open) setTempInfo(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tempInfo?.mode === "reset" ? "Password reset" : "User added"}
            </DialogTitle>
            <DialogDescription>
              Share this with {tempInfo?.name}. They'll be asked to set their own
              password on first sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {tempInfo?.email && (
              <div className="text-sm">
                <span className="text-muted-foreground">Email: </span>
                <span className="font-medium">{tempInfo.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm">
                {tempInfo?.tempPassword}
              </code>
              <Button size="sm" variant="outline" onClick={copyPassword} className="gap-1">
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This password is shown only once. Close this dialog and it can't be
              recovered — use Reset password to issue a new one.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setTempInfo(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirm */}
      <AlertDialog
        open={!!resetTarget}
        onOpenChange={(open) => !open && setResetTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset password?</AlertDialogTitle>
            <AlertDialogDescription>
              This issues a new temporary password for{" "}
              <span className="font-medium">
                {resetTarget?.full_name || resetTarget?.email}
              </span>{" "}
              and invalidates their current one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>
              Reset password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove user?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">
                {deleteTarget?.full_name || deleteTarget?.email}
              </span>{" "}
              will lose access immediately. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}