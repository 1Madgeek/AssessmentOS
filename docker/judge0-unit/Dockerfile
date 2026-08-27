# AssessmentOS Judge0 unit image — stock Judge0 plus frameworks used by
# apps/runner unit harness (pytest, Jest, PHPUnit, JUnit, GoogleTest).
# Build: docker compose -f docker-compose.yml -f docker-compose.judge0-unit.yml build
FROM judge0/judge0:1.13.0

USER root

ENV DEBIAN_FRONTEND=noninteractive \
    JUNIT_JAR_VERSION=1.10.2 \
    NODE_MAJOR=20 \
    JUNIT_CONSOLE_JAR=/opt/junit/junit-platform-console-standalone.jar

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    python3 \
    python3-pip \
    php-cli \
    php-xml \
    php-mbstring \
    g++ \
    cmake \
    pkg-config \
    libgtest-dev \
    openjdk-17-jdk-headless \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# pytest — prefer system install; fall back without --break-system-packages on older pip
RUN pip3 install --no-cache-dir pytest==8.3.5 \
    || pip3 install --no-cache-dir --break-system-packages pytest==8.3.5

# Node.js LTS + global Jest (Judge0 has ALLOW_ENABLE_NETWORK=false; avoid npx at runtime)
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g jest@29.7.0 \
    && rm -rf /var/lib/apt/lists/* /root/.npm

# PHPUnit PHAR on PATH
RUN curl -fsSL -o /usr/local/bin/phpunit \
      https://phar.phpunit.de/phpunit-11.phar \
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
