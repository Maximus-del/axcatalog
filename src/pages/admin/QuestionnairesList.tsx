import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Copy, Plus } from "lucide-react";

interface Row {
  id: string;
  title: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  response_count?: number;
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export default function QuestionnairesList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("questionnaires")
      .select("id,title,slug,is_active,created_at")
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Row[];
    if (list.length) {
      const counts = await Promise.all(
        list.map((r) =>
          supabase.from("questionnaire_responses").select("id", { count: "exact", head: true }).eq("questionnaire_id", r.id),
        ),
      );
      list.forEach((r, i) => (r.response_count = counts[i].count ?? 0));
    }
    setRows(list);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!title.trim()) return toast({ title: "Title is required", variant: "destructive" });
    const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      .from("questionnaires")
      .insert({ title: title.trim(), description: description.trim() || null, slug })
      .select("id")
      .single();
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Questionnaire created" });
    setOpenNew(false);
    setTitle("");
    setDescription("");
    window.location.href = `/admin/questionnaires/${data.id}`;
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/q/${slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: url });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="ax-page-title">Questionnaires</h1>
          <p className="text-muted-foreground text-sm mt-1">Build a survey, share the link, and create collections from responses.</p>
        </div>
        <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-2" />New questionnaire</Button>
      </div>

      <div className="ax-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Responses</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No questionnaires yet.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link to={`/admin/questionnaires/${r.id}`} className="font-medium hover:text-accent">{r.title}</Link>
                  <p className="text-xs text-muted-foreground font-mono">/q/{r.slug}</p>
                </TableCell>
                <TableCell><Badge variant={r.is_active ? "default" : "outline"}>{r.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                <TableCell className="text-right">{r.response_count ?? 0}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button size="sm" variant="outline" onClick={() => copyLink(r.slug)}><Copy className="h-3 w-3 mr-1" />Copy link</Button>
                  <Button size="sm" asChild><Link to={`/admin/questionnaires/${r.id}`}>Open</Link></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>New questionnaire</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Summer Camp Style Survey" />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quick style check-in so we can design your collection." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancel</Button>
            <Button onClick={() => void create()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}