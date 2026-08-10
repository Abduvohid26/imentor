import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LinkifiedText from './LinkifiedText';

describe('LinkifiedText', () => {
  it('havolani bosiladigan qiladi', () => {
    render(<LinkifiedText text="Manba: https://pubmed.ncbi.nlm.nih.gov/12345/ ko'rish mumkin." />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://pubmed.ncbi.nlm.nih.gov/12345/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('havola oxiridagi nuqtani manzilga qo\'shmaydi', () => {
    render(<LinkifiedText text="Batafsil: https://who.int/skin." />);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://who.int/skin');
  });

  it('bir nechta havolani ajratadi', () => {
    render(<LinkifiedText text="[1] https://a.example [2] https://b.example" />);
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('havolasiz matnni o\'zgarishsiz ko\'rsatadi', () => {
    render(<LinkifiedText text="Klinik tashxis va asoslanishi" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Klinik tashxis va asoslanishi')).toBeTruthy();
  });
});
