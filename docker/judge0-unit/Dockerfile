# AssessmentOS Judge0 unit image — stock Judge0 plus frameworks used by
# apps/runner unit harness (pytest, Jest, PHPUnit, JUnit, GoogleTest).
# Build: docker compose -f docker-compose.yml -f docker-compose.judge0-unit.yml build
#
# Base is Debian Buster (EOL) — apt must use archive.debian.org.
FROM judge0/judge0:1.13.1

USER root

ENV DEBIAN_FRONTEND=noninteractive \
    JUNIT_JAR_VERSION=1.10.2 \
    NODE_VERSION=20.18.1 \
    JUNIT_CONSOLE_JAR=/opt/junit/junit-platform-console-standalone.jar

# Buster mirrors are gone; drop stale third-party lists from the base image.
RUN set -eux; \
    sed -i \
      -e 's|http://deb.debian.org/debian|http://archive.debian.org/debian|g' \
      -e 's|https://deb.debian.org/debian|http://archive.debian.org/debian|g' \
      -e 's|http://security.debian.org/debian-security|http://archive.debian.org/debian-security|g' \
      -e 's|https://security.debian.org/debian-security|http://archive.debian.org/debian-security|g' \
      /etc/apt/sources.list; \
    find /etc/apt/sources.list.d -type f -delete 2>/dev/null || true; \
    printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99no-check-valid-until; \
    apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      xz-utils \
      python3 \
      python3-pip \
      php-cli \
      php-xml \
      php-mbstring \
      g++ \
      cmake \
      pkg-config \
      libgtest-dev \
      openjdk-11-jdk-headless \
      unzip \
    && rm -rf /var/lib/apt/lists/*

# pytest — Buster has Python 3.7; keep a 7.x release
RUN pip3 install --no-cache-dir "pytest==7.4.4"

# Node.js LTS from official tarball (nodesource apt targets are broken on EOL Buster).
# Global Jest — Judge0 has ALLOW_ENABLE_NETWORK=false; avoid npx at runtime.
RUN set -eux; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1; \
    npm install -g jest@29.7.0; \
    rm -rf /root/.npm

# PHPUnit PHAR on PATH — PHPUnit 9 supports Buster's PHP 7.3
RUN curl -fsSL -o /usr/local/bin/phpunit \
      https://phar.phpunit.de/phpunit-9.phar \
    && chmod +x /usr/local/bin/phpunit

# JUnit console standalone (paths match apps/runner unit-workspace scripts)
RUN mkdir -p /opt/junit /usr/share/java \
    && curl -fsSL -o /opt/junit/junit-platform-console-standalone.jar \
      "https://repo1.maven.org/maven2/org/junit/platform/junit-platform-console-standalone/${JUNIT_JAR_VERSION}/junit-platform-console-standalone-${JUNIT_JAR_VERSION}.jar" \
    && ln -sf /opt/junit/junit-platform-console-standalone.jar \
      /usr/share/java/junit-platform-console-standalone.jar

# Build GoogleTest from libgtest-dev sources into /usr/local
RUN set -eux; \
    SRC=""; \
    for d in /usr/src/googletest /usr/src/gtest; do \
      if [ -d "$d" ]; then SRC="$d"; break; fi; \
    done; \
    test -n "$SRC"; \
    cmake -S "$SRC" -B /tmp/gtest-build -DBUILD_GMOCK=OFF -DCMAKE_INSTALL_PREFIX=/usr/local; \
    cmake --build /tmp/gtest-build; \
    cmake --install /tmp/gtest-build; \
    ldconfig; \
    rm -rf /tmp/gtest-build

# Fail the build early if tools are missing
RUN python3 -m pytest --version \
    && node --version && jest --version \
    && phpunit --version \
    && test -f /opt/junit/junit-platform-console-standalone.jar \
    && g++ --version \
    && (test -f /usr/local/lib/libgtest.a || test -f /usr/local/lib/libgtest.so \
        || ls /usr/local/lib/*/libgtest* >/dev/null 2>&1 \
        || ls /usr/lib/*/libgtest* >/dev/null 2>&1)
