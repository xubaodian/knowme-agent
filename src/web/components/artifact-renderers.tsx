import {
  BarChart3,
  Code2,
  File,
  FileJson,
  FileText,
  Globe2,
  Image as ImageIcon,
  Presentation,
  Table2
} from "lucide-react";
import type {
  Artifact,
  ChartArtifact,
  CodeArtifact,
  FileArtifact,
  HtmlArtifact,
  ImageArtifact,
  JsonArtifact,
  PdfArtifact,
  SlidesArtifact,
  TableArtifact,
  TextArtifact
} from "../../shared/types";
import { Badge } from "./ui/badge";

export function ArtifactRenderer({ artifact }: { artifact: Artifact }) {
  switch (artifact.kind) {
    case "markdown":
    case "text":
      return <TextArtifactPreview artifact={artifact} />;
    case "code":
      return <CodeArtifactPreview artifact={artifact} />;
    case "html":
      return <HtmlArtifactPreview artifact={artifact} />;
    case "image":
      return <ImageArtifactPreview artifact={artifact} />;
    case "pdf":
      return <PdfArtifactPreview artifact={artifact} />;
    case "slides":
      return <SlidesArtifactPreview artifact={artifact} />;
    case "table":
      return <TableArtifactPreview artifact={artifact} />;
    case "chart":
      return <ChartArtifactPreview artifact={artifact} />;
    case "json":
      return <JsonArtifactPreview artifact={artifact} />;
    case "file":
      return <FileArtifactPreview artifact={artifact} />;
  }
}

export type ArtifactDownload = {
  href: string;
  fileName: string;
};

export function getArtifactDownload(artifact: Artifact): ArtifactDownload | undefined {
  const fileName = getArtifactFileName(artifact);

  switch (artifact.kind) {
    case "markdown":
    case "text":
      return createTextDownload(artifact.content, fileName, artifact.kind === "markdown" ? "text/markdown" : "text/plain");
    case "code":
      return createTextDownload(artifact.content, fileName, "text/plain");
    case "html":
      return createTextDownload(artifact.content, fileName, "text/html");
    case "json":
      return createTextDownload(`${JSON.stringify(artifact.value, null, 2)}\n`, fileName, "application/json");
    case "table":
      return createTextDownload(tableToCsv(artifact), fileName, "text/csv");
    case "slides":
      return createTextDownload(`${JSON.stringify(artifact.slides, null, 2)}\n`, fileName, "application/json");
    case "chart":
      return createTextDownload(
        `${JSON.stringify({ chartType: artifact.chartType, series: artifact.series, unit: artifact.unit }, null, 2)}\n`,
        fileName,
        "application/json"
      );
    case "image":
      return artifact.url ? { href: artifact.url, fileName } : undefined;
    case "pdf":
      return artifact.url ? { href: artifact.url, fileName } : undefined;
    case "file":
      return artifact.url ? { href: artifact.url, fileName } : undefined;
  }
}

export function ArtifactKindIcon({ artifact }: { artifact: Artifact }) {
  const className = "size-4";

  switch (artifact.kind) {
    case "markdown":
    case "text":
      return <FileText className={className} />;
    case "code":
      return <Code2 className={className} />;
    case "html":
      return <Globe2 className={className} />;
    case "image":
      return <ImageIcon className={className} />;
    case "pdf":
    case "file":
      return <File className={className} />;
    case "slides":
      return <Presentation className={className} />;
    case "table":
      return <Table2 className={className} />;
    case "chart":
      return <BarChart3 className={className} />;
    case "json":
      return <FileJson className={className} />;
  }
}

function TextArtifactPreview({ artifact }: { artifact: TextArtifact }) {
  if (artifact.kind === "markdown") {
    return <div className="space-y-3 p-5">{renderMarkdown(artifact.content)}</div>;
  }

  return <pre className="whitespace-pre-wrap p-5 text-sm leading-6">{artifact.content}</pre>;
}

function CodeArtifactPreview({ artifact }: { artifact: CodeArtifact }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-code text-code-foreground">
      <div className="flex h-10 shrink-0 items-center justify-between bg-white/5 px-4">
        <span className="text-xs font-medium uppercase tracking-wide text-white/60">{artifact.language}</span>
        <Badge className="text-white/70" variant="outline">
          code
        </Badge>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto bg-code p-5 text-sm leading-6">
        <code className="block min-w-max">{artifact.content}</code>
      </pre>
    </div>
  );
}

function HtmlArtifactPreview({ artifact }: { artifact: HtmlArtifact }) {
  return (
    <iframe
      className="h-full min-h-[360px] w-full bg-white"
      sandbox="allow-forms allow-popups allow-scripts"
      srcDoc={artifact.content}
      title={artifact.title}
    />
  );
}

function ImageArtifactPreview({ artifact }: { artifact: ImageArtifact }) {
  return (
    <div className="grid h-full min-h-[360px] place-items-center bg-muted/40 p-5">
      <img alt={artifact.alt ?? artifact.title} className="max-h-full max-w-full rounded-md bg-background shadow-[var(--shadow-soft)]" src={artifact.url} />
    </div>
  );
}

function PdfArtifactPreview({ artifact }: { artifact: PdfArtifact }) {
  if (artifact.url) {
    return <iframe className="h-full min-h-[420px] w-full bg-white" src={artifact.url} title={artifact.title} />;
  }

  return (
    <div className="grid min-h-[320px] place-items-center p-8 text-center">
      <div>
        <File className="mx-auto mb-3 size-10 text-muted-foreground" />
        <h3 className="text-sm font-semibold">PDF preview ready</h3>
        <p className="mt-1 text-sm text-muted-foreground">{artifact.fileName ?? "Attach a PDF URL to render it here."}</p>
      </div>
    </div>
  );
}

function SlidesArtifactPreview({ artifact }: { artifact: SlidesArtifact }) {
  return (
    <div className="grid gap-4 p-5 lg:grid-cols-2">
      {artifact.slides.map((slide, index) => (
        <section className="glass-panel aspect-video rounded-lg p-5" key={slide.title}>
          <div className="mb-4 flex items-center justify-between">
            <Badge variant="outline">Slide {index + 1}</Badge>
            <Presentation className="size-4 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">{slide.title}</h3>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {slide.bullets.map((bullet) => (
              <li className="flex gap-2" key={bullet}>
                <span className="text-primary">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TableArtifactPreview({ artifact }: { artifact: TableArtifact }) {
  return (
    <div className="overflow-auto p-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            {artifact.columns.map((column) => (
              <th className="px-3 py-2 text-left font-semibold" key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {artifact.rows.map((row, index) => (
            <tr className="odd:bg-background/30 even:bg-muted/20" key={index}>
              {artifact.columns.map((column) => (
                <td className="px-3 py-2 text-muted-foreground" key={column.key}>
                  {String(row[column.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartArtifactPreview({ artifact }: { artifact: ChartArtifact }) {
  const max = Math.max(...artifact.series.map((item) => item.value), 1);

  return (
    <div className="space-y-4 p-5">
      {artifact.series.map((item) => (
        <div className="grid grid-cols-[6rem_minmax(0,1fr)_4rem] items-center gap-3" key={item.label}>
          <span className="truncate text-sm font-medium">{item.label}</span>
          <div className="h-8 rounded-md bg-muted">
            <div
              className="h-8 rounded-md bg-primary"
              style={{ width: `${Math.max((item.value / max) * 100, 4)}%` }}
            />
          </div>
          <span className="text-right text-sm text-muted-foreground">
            {item.value}
            {artifact.unit ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function JsonArtifactPreview({ artifact }: { artifact: JsonArtifact }) {
  return (
    <pre className="h-full overflow-auto bg-code p-5 text-sm leading-6 text-code-foreground">
      <code className="block min-w-max">{JSON.stringify(artifact.value, null, 2)}</code>
    </pre>
  );
}

function FileArtifactPreview({ artifact }: { artifact: FileArtifact }) {
  return (
    <div className="grid min-h-[320px] place-items-center p-8">
      <div className="glass-panel w-full max-w-md rounded-md p-5">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-md bg-muted/75">
            <File className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{artifact.fileName}</h3>
            <p className="text-sm text-muted-foreground">
              {artifact.mimeType}
              {artifact.sizeBytes ? ` · ${formatBytes(artifact.sizeBytes)}` : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderMarkdown(content: string) {
  return content.split("\n").map((line, index) => {
    if (line.startsWith("# ")) {
      return (
        <h1 className="text-xl font-semibold" key={index}>
          {line.slice(2)}
        </h1>
      );
    }

    if (line.startsWith("## ")) {
      return (
        <h2 className="text-base font-semibold" key={index}>
          {line.slice(3)}
        </h2>
      );
    }

    if (line.startsWith("- ")) {
      return (
        <p className="pl-4 text-sm leading-6 before:mr-2 before:content-['•']" key={index}>
          {line.slice(2)}
        </p>
      );
    }

    if (line.startsWith("> ")) {
      return (
        <blockquote className="rounded-md bg-accent/10 px-3 py-2 text-sm leading-6 text-muted-foreground" key={index}>
          {line.slice(2)}
        </blockquote>
      );
    }

    if (!line.trim()) {
      return <div className="h-1" key={index} />;
    }

    return (
      <p className="text-sm leading-6" key={index}>
        {line}
      </p>
    );
  });
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getArtifactFileName(artifact: Artifact): string {
  if (artifact.kind === "file") {
    return artifact.fileName || artifact.title;
  }

  if (artifact.kind === "pdf") {
    return artifact.fileName || ensureExtension(artifact.title, "pdf");
  }

  return ensureExtension(artifact.title, extensionForArtifact(artifact));
}

function extensionForArtifact(artifact: Artifact): string {
  switch (artifact.kind) {
    case "markdown":
      return "md";
    case "text":
      return "txt";
    case "code":
      return extensionForLanguage(artifact.language);
    case "html":
      return "html";
    case "image":
      return "png";
    case "slides":
    case "chart":
    case "json":
      return "json";
    case "table":
      return "csv";
    case "pdf":
      return "pdf";
    case "file":
      return "bin";
  }
}

function extensionForLanguage(language: string) {
  const normalized = language.toLowerCase();

  if (normalized.includes("javascript") || normalized === "js" || normalized === "node") {
    return "js";
  }

  if (normalized.includes("typescript") || normalized === "ts") {
    return "ts";
  }

  if (normalized.includes("python") || normalized === "py") {
    return "py";
  }

  if (normalized.includes("css")) {
    return "css";
  }

  return "txt";
}

function ensureExtension(title: string, extension: string) {
  const normalizedTitle = title.trim() || "artifact";
  const lastSegment = normalizedTitle.split(/[\\/]/u).at(-1) ?? normalizedTitle;

  if (/\.[a-z0-9]{1,8}$/iu.test(lastSegment)) {
    return normalizedTitle;
  }

  return normalizedTitle.toLowerCase().endsWith(`.${extension}`) ? normalizedTitle : `${normalizedTitle}.${extension}`;
}

function createTextDownload(content: string, fileName: string, mimeType: string): ArtifactDownload {
  return {
    href: `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`,
    fileName
  };
}

function tableToCsv(artifact: TableArtifact) {
  const rows = [
    artifact.columns.map((column) => column.label),
    ...artifact.rows.map((row) => artifact.columns.map((column) => String(row[column.key] ?? "")))
  ];

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value: string) {
  return /[",\n]/u.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}
