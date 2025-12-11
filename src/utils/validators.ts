import { ValidationResult, StopRequest, RouteRequest, ValidationError } from '../types';

/**
 * Validador para códigos de paradero (codsimt)
 */
export function validateStopCode(codsimt: string): ValidationResult {
  if (!codsimt) {
    return { valid: false, error: 'Código de paradero es requerido' };
  }

  if (typeof codsimt !== 'string') {
    return { valid: false, error: 'Código de paradero debe ser una cadena de texto' };
  }

  // Remover espacios en blanco
  const trimmedCode = codsimt.trim();

  if (trimmedCode.length < 3) {
    return {
      valid: false,
      error: 'Código de paradero debe tener al menos 3 caracteres'
    };
  }

  if (trimmedCode.length > 10) {
    return { valid: false, error: 'Código de paradero muy largo (máximo 10 caracteres)' };
  }

  // Verificar que solo contenga caracteres alfanuméricos
  const validPattern = /^[A-Za-z0-9]+$/;
  if (!validPattern.test(trimmedCode)) {
    return {
      valid: false,
      error: 'Código de paradero solo puede contener letras y números'
    };
  }

  return { valid: true };
}

/**
 * Validador para códigos de servicio (codser)
 */
export function validateServiceCode(codser: string): ValidationResult {
  if (!codser) {
    return { valid: false, error: 'Código de servicio es requerido' };
  }

  if (typeof codser !== 'string') {
    return { valid: false, error: 'Código de servicio debe ser una cadena de texto' };
  }

  // Remover espacios en blanco
  const trimmedCode = codser.trim();

  if (trimmedCode.length < 1) {
    return {
      valid: false,
      error: 'Código de servicio debe tener al menos 1 carácter'
    };
  }

  if (trimmedCode.length > 10) {
    return { valid: false, error: 'Código de servicio muy largo (máximo 10 caracteres)' };
  }

  // Verificar que contenga caracteres válidos (letras, números, guiones)
  const validPattern = /^[A-Za-z0-9\-_]+$/;
  if (!validPattern.test(trimmedCode)) {
    return {
      valid: false,
      error: 'Código de servicio contiene caracteres inválidos'
    };
  }

  return { valid: true };
}

/**
 * Valida y limpia un código de paradero, lanzando error si es inválido
 */
export function validateAndCleanStopCode(codsimt: string): string {
  const validation = validateStopCode(codsimt);

  if (!validation.valid) {
    throw new ValidationError(validation.error || 'Código de paradero inválido');
  }

  return codsimt.trim().toUpperCase();
}

/**
 * Valida y limpia un código de servicio, lanzando error si es inválido
 */
export function validateAndCleanServiceCode(codser: string): string {
  const validation = validateServiceCode(codser);

  if (!validation.valid) {
    throw new ValidationError(validation.error || 'Código de servicio inválido');
  }

  return codser.trim();
}

/**
 * Validador de parámetros de request para stops
 */
export function validateStopRequest(params: any): StopRequest {
  const { codsimt } = params;

  const validation = validateStopCode(codsimt);
  if (!validation.valid) {
    throw new ValidationError(validation.error || 'Parámetros inválidos para stop request');
  }

  return {
    codsimt: validateAndCleanStopCode(codsimt)
  };
}

/**
 * Validador de parámetros de request para routes
 */
export function validateRouteRequest(params: any): RouteRequest {
  const { codser } = params;

  const validation = validateServiceCode(codser);
  if (!validation.valid) {
    throw new ValidationError(validation.error || 'Parámetros inválidos para route request');
  }

  return {
    codser: validateAndCleanServiceCode(codser)
  };
}

/**
 * Validador de formato de email (por si se necesita en el futuro)
 */
export function validateEmail(email: string): ValidationResult {
  if (!email) {
    return { valid: false, error: 'Email es requerido' };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return { valid: false, error: 'Formato de email inválido' };
  }

  return { valid: true };
}

/**
 * Validador de números de página para paginación
 */
export function validatePage(page: string | number): ValidationResult {
  const pageNum = typeof page === 'string' ? parseInt(page) : page;

  if (isNaN(pageNum)) {
    return { valid: false, error: 'Número de página debe ser un número' };
  }

  if (pageNum < 1) {
    return { valid: false, error: 'Número de página debe ser mayor a 0' };
  }

  if (pageNum > 1000) {
    return { valid: false, error: 'Número de página muy alto (máximo 1000)' };
  }

  return { valid: true };
}

/**
 * Validador de límite de resultados para paginación
 */
export function validateLimit(limit: string | number): ValidationResult {
  const limitNum = typeof limit === 'string' ? parseInt(limit) : limit;

  if (isNaN(limitNum)) {
    return { valid: false, error: 'Límite debe ser un número' };
  }

  if (limitNum < 1) {
    return { valid: false, error: 'Límite debe ser mayor a 0' };
  }

  if (limitNum > 100) {
    return { valid: false, error: 'Límite muy alto (máximo 100)' };
  }

  return { valid: true };
}

/**
 * Validador de coordenadas geográficas
 */
export function validateCoordinates(lat: number, lon: number): ValidationResult {
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return { valid: false, error: 'Las coordenadas deben ser números' };
  }

  if (isNaN(lat) || isNaN(lon)) {
    return { valid: false, error: 'Las coordenadas no pueden ser NaN' };
  }

  if (lat < -90 || lat > 90) {
    return { valid: false, error: 'Latitud debe estar entre -90 y 90' };
  }

  if (lon < -180 || lon > 180) {
    return { valid: false, error: 'Longitud debe estar entre -180 y 180' };
  }

  return { valid: true };
}

/**
 * Sanitiza una cadena de texto removiendo caracteres peligrosos
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .replace(/[<>]/g, '') // Remover < y >
    .replace(/['"]/g, '') // Remover comillas
    .replace(/\0/g, '') // Remover null bytes
    .substring(0, 1000); // Limitar longitud
}

/**
 * Valida si una cadena contiene solo caracteres seguros
 */
export function isSafeString(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }

  // Permitir solo caracteres alfanuméricos, espacios y algunos símbolos básicos
  const safePattern = /^[A-Za-z0-9\s\-_.,;:!?()]+$/;
  return safePattern.test(input) && input.length <= 1000;
}
