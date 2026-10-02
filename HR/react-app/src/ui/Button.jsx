import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

/**
 * Button: one component for every action.
 *
 * variant: primary (main action, one per view) | secondary (other actions) | danger | success |
 *          warning | soft (tinted, for row actions) | outline | ghost | link
 * size:    sm | md | lg
 * loading: shows a spinner and disables the button (no double submits)
 * to:      renders a router <Link> styled as a button; href renders an <a>
 */
const VARIANT_CLASS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  success: 'btn-success',
  warning: 'btn-warning',
  soft: 'btn-info',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  link: 'btn-link',
};

const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', loading = false, disabled, icon, iconEnd, block, to, href, className = '', children, type, ...rest },
  ref,
) {
  const classes = [
    'btn',
    VARIANT_CLASS[variant] || VARIANT_CLASS.secondary,
    size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '',
    block ? 'btn-block' : '',
    loading ? 'is-loading' : '',
    className,
  ].filter(Boolean).join(' ');

  const content = (
    <>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children != null && <span>{children}</span>}
      {iconEnd && <Icon name={iconEnd} size={size === 'sm' ? 16 : 18} />}
    </>
  );

  if (to) {
    return <Link ref={ref} to={to} className={classes} aria-disabled={disabled || undefined} {...rest}>{content}</Link>;
  }
  if (href) {
    return <a ref={ref} href={href} className={classes} aria-disabled={disabled || undefined} {...rest}>{content}</a>;
  }
  return (
    <button ref={ref} type={type || 'button'} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

export default Button;

/** Square icon-only button; `label` is required because there is no visible text. */
export const IconButton = forwardRef(function IconButton({ icon, label, variant = 'ghost', size = 'md', className = '', ...rest }, ref) {
  return (
    <Button ref={ref} variant={variant} size={size} className={`btn-icon ${className}`.trim()} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size === 'sm' ? 16 : 18} />
    </Button>
  );
});
