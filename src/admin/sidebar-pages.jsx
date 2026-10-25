import React from 'react';
import { useCurrentAdmin } from 'adminjs';

const SidebarPages = ({ OriginalComponent, pages, ...rest }) => {
  const [currentAdmin] = useCurrentAdmin();
  const allowed = new Set(
    Array.isArray(currentAdmin?.allowedPages) ? currentAdmin.allowedPages : [],
  );
  const visiblePages = (pages ?? []).filter((page) => allowed.has(page.name));

  return <OriginalComponent {...rest} pages={visiblePages} />;
};

export default SidebarPages;
