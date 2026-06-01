import type { JsonPath } from "../core/path";

type BreadcrumbsProps = {
  path: JsonPath;
  onNavigate: (path: JsonPath) => void;
};

export function Breadcrumbs({ path, onNavigate }: BreadcrumbsProps) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <button className="breadcrumbs__button" type="button" onClick={() => onNavigate([])}>
        Root
      </button>
      {path.map((segment, index) => (
        <span key={`${String(segment)}:${index}`}>
          <span>/</span>{" "}
          <button className="breadcrumbs__button" type="button" onClick={() => onNavigate(path.slice(0, index + 1))}>
            {String(segment)}
          </button>
        </span>
      ))}
    </nav>
  );
}
