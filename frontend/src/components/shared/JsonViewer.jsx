export default function JsonViewer({ value }) {
  if (!value) return null

  return (
    <pre className="mt-4 max-h-72 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-left text-xs text-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}
