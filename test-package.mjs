// Quick test to verify the package exports
import { 
  HttpClient, 
  BaseEndpoint, 
  BearerTokenAuth,
  ApiKeyAuth,
  NoAuth,
  ApiError,
  safeParse,
  parseOrThrow,
  HTTPMethod,
  Id,
  Timestamps,
  Meta,
  ApiErrorSchema,
  Envelope
} from './dist/index.js';

console.log('✓ HttpClient:', typeof HttpClient);
console.log('✓ BaseEndpoint:', typeof BaseEndpoint);
console.log('✓ BearerTokenAuth:', typeof BearerTokenAuth);
console.log('✓ ApiKeyAuth:', typeof ApiKeyAuth);
console.log('✓ NoAuth:', typeof NoAuth);
console.log('✓ ApiError:', typeof ApiError);
console.log('✓ safeParse:', typeof safeParse);
console.log('✓ parseOrThrow:', typeof parseOrThrow);
console.log('✓ HTTPMethod:', HTTPMethod);
console.log('✓ Id:', typeof Id);
console.log('✓ Timestamps:', typeof Timestamps);
console.log('✓ Meta:', typeof Meta);
console.log('✓ ApiErrorSchema:', typeof ApiErrorSchema);
console.log('✓ Envelope:', typeof Envelope);

console.log('\n✅ All exports are available!');
