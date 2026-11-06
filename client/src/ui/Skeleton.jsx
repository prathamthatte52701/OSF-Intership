import React from 'react';

// Reuses the shimmer in styles.css (.skeleton-row); reduced-motion is handled globally there.
export function Skeleton({ height = 44, width = '100%', radius, className = '' }) {
  return <div aria-hidden="true" className={`skeleton-row ${className}`} style={{ height, width, ...(radius ? { borderRadius: radius } : null) }} />;
}
