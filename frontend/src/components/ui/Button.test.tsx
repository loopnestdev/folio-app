import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByText('Disabled').closest('button')).toBeDisabled();
  });

  it('is disabled when loading prop is true', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByText('Loading').closest('button')).toBeDisabled();
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Disabled</Button>);
    fireEvent.click(screen.getByText('Disabled'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies primary variant styles', () => {
    render(<Button variant="primary">Primary</Button>);
    const btn = screen.getByText('Primary').closest('button');
    expect(btn?.className).toContain('bg-[var(--c-primary)]');
  });

  it('applies secondary variant styles', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByText('Secondary').closest('button');
    expect(btn?.className).toContain('bg-[var(--c-canvas)]');
  });

  it('applies danger variant styles', () => {
    render(<Button variant="danger">Danger</Button>);
    const btn = screen.getByText('Danger').closest('button');
    expect(btn?.className).toContain('bg-[var(--c-bear)]');
  });

  it('applies ghost variant styles', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByText('Ghost').closest('button');
    expect(btn?.className).toContain('bg-transparent');
  });

  it('renders with an icon on the left by default', () => {
    const icon = <span data-testid="test-icon">★</span>;
    render(<Button icon={icon}>With Icon</Button>);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('shows spinner when loading', () => {
    render(<Button loading>Loading button</Button>);
    // The spinner SVG should be present
    expect(document.querySelector('svg.animate-spin')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Button className="custom-class">Custom</Button>);
    const btn = screen.getByText('Custom').closest('button');
    expect(btn?.className).toContain('custom-class');
  });

  it('applies correct size styles for sm', () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByText('Small').closest('button');
    expect(btn?.className).toContain('text-[15px]');
  });

  it('applies correct size styles for lg', () => {
    render(<Button size="lg">Large</Button>);
    const btn = screen.getByText('Large').closest('button');
    expect(btn?.className).toContain('text-[19px]');
  });

  it('forwards native button attributes', () => {
    render(<Button type="submit" name="submit-btn">Submit</Button>);
    const btn = screen.getByText('Submit').closest('button');
    expect(btn).toHaveAttribute('type', 'submit');
    expect(btn).toHaveAttribute('name', 'submit-btn');
  });
});
