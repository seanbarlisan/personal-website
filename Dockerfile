# Stable NGINX image we plan to use 
FROM nginx:stable 

# Copy the src directory into the NGINX HTML directory, forcefully uses the index.html file
COPY src/ /usr/share/nginx/html


# docker build -t personal-websitev#:latest .
# docker run -p 8080:80 personal-websitev#:latest 