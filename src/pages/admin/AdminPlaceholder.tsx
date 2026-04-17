export default function AdminPlaceholder({ title }: { title: string }) {
  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <div className="ax-section-header mb-2">{title}</div>
      <h1 className="text-3xl font-bold mb-6">{title}</h1>
      <div className="ax-card p-12 text-center">
        <p className="text-muted-foreground">Coming in the next pass.</p>
      </div>
    </div>
  );
}
