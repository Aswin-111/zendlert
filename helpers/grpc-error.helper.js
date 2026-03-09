import grpc from "@grpc/grpc-js";

// Centralized HTTP-to-gRPC status conversion used by alert gRPC boundaries.
export function toGrpcErrorCode(statusCode) {
  if (statusCode === 400) return grpc.status.INVALID_ARGUMENT;
  if (statusCode === 404) return grpc.status.NOT_FOUND;
  if (statusCode === 409) return grpc.status.FAILED_PRECONDITION;
  return grpc.status.INTERNAL;
}
