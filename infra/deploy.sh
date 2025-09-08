#!/bin/bash

set -e

IMAGE_NAME="dragon-isle"
CONTAINER_NAME="dragon-isle-container"

TAG="latest"
PORT="8081"
NO_CACHE=0

print_usage() {
  cat <<EOF
Usage: ./infra/deploy.sh [tag] [port] [--no-cache]

Examples:
  ./infra/deploy.sh                   # build latest, run on 8081
  ./infra/deploy.sh v1.0.1            # build v1.0.1, run on 8081
  ./infra/deploy.sh latest 9001       # build latest, run on 9001
  ./infra/deploy.sh --no-cache        # force rebuild without Docker cache
  ./infra/deploy.sh v1.0.1 --no-cache # tag with no cache
EOF
}

# Parse args: positional TAG, PORT; flags: --no-cache, -h/--help
TAG_SET=0
PORT_SET=0
for arg in "$@"; do
  case "$arg" in
    -h|--help)
      print_usage
      exit 0
      ;;
    --no-cache)
      NO_CACHE=1
      ;;
    *)
      if [ $TAG_SET -eq 0 ]; then
        TAG="$arg"; TAG_SET=1
      elif [ $PORT_SET -eq 0 ]; then
        PORT="$arg"; PORT_SET=1
      else
        echo "Unknown extra argument: $arg" >&2
        print_usage
        exit 1
      fi
      ;;
  esac
done

echo "Building Docker image... (tag=$TAG, no-cache=$NO_CACHE)"
BUILD_FLAGS=""
if [ "$NO_CACHE" -eq 1 ]; then
  BUILD_FLAGS="--no-cache"
fi
docker build $BUILD_FLAGS -t ${IMAGE_NAME}:${TAG} -f infra/Dockerfile .

echo "Stopping existing container..."
docker stop ${CONTAINER_NAME} 2>/dev/null || true
docker rm ${CONTAINER_NAME} 2>/dev/null || true

echo "Starting new container..."
docker run -d \
  --name ${CONTAINER_NAME} \
  --restart unless-stopped \
  -p 127.0.0.1:${PORT}:80 \
  ${IMAGE_NAME}:${TAG}

echo "Deployment complete!"
echo "Dragon Isle is now running at http://localhost:${PORT}"
echo "Port ${PORT} is reserved for dragon-isle project"

echo "Container logs:"
docker logs ${CONTAINER_NAME}
