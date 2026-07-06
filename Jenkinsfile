// Self-hosted CI/CD pipeline for the backend (Jenkins on AWS EC2).
//
// Prerequisites on the Jenkins agent: Node 22, Docker, sonar-scanner CLI, snyk CLI, k6.
// Set up as a Multibranch Pipeline job pointed at the GitHub repo (webhook-triggered)
// so `BRANCH_NAME` / `when { branch }` resolve correctly.
//
// Required Jenkins credentials: dockerhub-credentials (username/password),
// sonar-token (secret text), snyk-token (secret text),
// app-ec2-ssh-key (SSH private key for the staging EC2 host),
// staging-database-url (secret text — DATABASE_URL for the staging RDS).
// Required env on the controller/agent: SONAR_HOST_URL, STAGING_EC2_HOST,
// STAGING_EC2_USER, SLACK_WEBHOOK_URL (optional).
//
// Blue/Green: the backend runs on host ports 4000 (blue) / 4001 (green) so it does
// not clash with the frontend containers (3000/3001) on the same EC2 host.
//
// Branch behavior (spec §3): main -> Lint/Test/Build only; deploy/production -> all stages.
pipeline {
  agent any

  environment {
    IMAGE_NAME = 'secret-notes-backend'
    DOCKERHUB_CREDENTIALS = credentials('dockerhub-credentials')
    SONAR_TOKEN = credentials('sonar-token')
    SNYK_TOKEN = credentials('snyk-token')
    STAGING_DATABASE_URL = credentials('staging-database-url')
  }

  stages {
    stage('Lint') {
      steps {
        sh 'npx snyk auth "$SNYK_TOKEN" && npx snyk test --severity-threshold=high'
        sh 'sonar-scanner -Dsonar.host.url="$SONAR_HOST_URL" -Dsonar.login="$SONAR_TOKEN"'
      }
    }

    stage('Test') {
      steps {
        sh 'npm ci'
        // TODO §3: add Jest config + >=10 tests (deferred on purpose).
        sh 'npm test -- --coverage'
      }
    }

    stage('Build') {
      steps {
        sh "docker build -t ${IMAGE_NAME}:${env.GIT_COMMIT} ."
      }
    }

    stage('Deliver') {
      when { branch 'deploy/production' }
      steps {
        sh '''
          echo "$DOCKERHUB_CREDENTIALS_PSW" | docker login -u "$DOCKERHUB_CREDENTIALS_USR" --password-stdin
          docker tag "$IMAGE_NAME:$GIT_COMMIT" "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT"
          docker tag "$IMAGE_NAME:$GIT_COMMIT" "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:latest"
          docker push "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT"
          docker push "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:latest"
        '''
      }
    }

    stage('Deploy to Staging (Inactive Env)') {
      when { branch 'deploy/production' }
      steps {
        sshagent(credentials: ['app-ec2-ssh-key']) {
          sh '''
            set -e
            # Pick the inactive environment: if blue is up, deploy green, else blue.
            ACTIVE_BLUE=$(ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST "docker ps -q -f name=backend-blue | wc -l")

            if [ "$ACTIVE_BLUE" -eq "1" ]; then
              TARGET_ENV="green"; TARGET_PORT=4001
            else
              TARGET_ENV="blue"; TARGET_PORT=4000
            fi

            echo "Deploying backend to INACTIVE environment: $TARGET_ENV on port $TARGET_PORT"

            ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST "
              docker login -u $DOCKERHUB_CREDENTIALS_USR -p $DOCKERHUB_CREDENTIALS_PSW
              docker pull $DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT

              docker stop backend-$TARGET_ENV || true
              docker rm backend-$TARGET_ENV || true

              # NOTE: the staging RDS schema must already exist (run 'npm run migrate'
              # against \$STAGING_DATABASE_URL once). A missing table is what makes
              # /notes return HTTP 500.
              docker run -d --name backend-$TARGET_ENV -p $TARGET_PORT:3000 \
                -e DATABASE_URL='$STAGING_DATABASE_URL' \
                $DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT
            "

            echo $TARGET_ENV > target_env.txt
            echo $TARGET_PORT > target_port.txt
          '''
        }
      }
    }

    stage('E2E & Performance (k6) & Switch') {
      when { branch 'deploy/production' }
      steps {
        // 1) Wait for the new container to become healthy, then run the k6 load
        //    test against it directly (container serves /notes at the root, so no
        //    /api prefix here). A threshold breach fails this step and the switch
        //    below never runs.
        sh '''
          set -e
          TARGET_PORT=$(cat target_port.txt)
          BASE="http://$STAGING_EC2_HOST:$TARGET_PORT"

          echo "Waiting for backend health at $BASE/health ..."
          for i in $(seq 1 30); do
            if curl -fsS "$BASE/health" >/dev/null 2>&1; then echo "healthy"; break; fi
            sleep 2
            if [ "$i" -eq 30 ]; then echo "backend never became healthy"; exit 1; fi
          done

          echo "Running k6 performance test against $BASE"
          k6 run -e API_BASE_URL="$BASE" k6/notes-load-test.js
        '''

        // 2) Only reached if k6 passed: switch nginx to the new backend, stop old.
        sshagent(credentials: ['app-ec2-ssh-key']) {
          sh '''
            set -e
            TARGET_ENV=$(cat target_env.txt)
            if [ "$TARGET_ENV" = "green" ]; then OLD_ENV="blue"; else OLD_ENV="green"; fi

            echo "k6 passed — switching API traffic to $TARGET_ENV..."

            ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST "
              sudo ln -sf /etc/nginx/sites-available/backend-$TARGET_ENV /etc/nginx/sites-enabled/backend
              sudo systemctl reload nginx

              docker stop backend-$OLD_ENV || true
            "
          '''
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'k6-summary.json', allowEmptyArchive: true
        }
      }
    }
  }

  post {
    failure {
      sh '''
        if [ -n "$SLACK_WEBHOOK_URL" ]; then
          curl -s -X POST -H "Content-type: application/json" \
            --data "{\"text\":\"❌ ${JOB_NAME} #${BUILD_NUMBER} failed on ${BRANCH_NAME} — ${BUILD_URL}\"}" \
            "$SLACK_WEBHOOK_URL"
        fi
      '''
    }
  }
}
